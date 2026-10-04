import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from 'src/cache_storage/services/redis.service';
import { buildPlatformCacheKey } from 'src/shared/utils/cache-key.util';
import {
  CustomFieldDefinition,
  CustomFieldEntityType,
  CustomFieldType,
} from './entities/custom-field-definition.entity';
import { CreateCustomFieldDefinitionDto } from './dtos/create-custom-field-definition.dto';
import { UpdateCustomFieldDefinitionDto } from './dtos/update-custom-field-definition.dto';

export interface CustomFieldValidationResult {
  valid: boolean;
  errors: string[];
}

function rangeErrors(subject: string, measured: number, min?: number, max?: number): string[] {
  const errors: string[] = [];
  if (min !== undefined && measured < min) {
    errors.push(`${subject} must be >= ${min}`);
  }
  if (max !== undefined && measured > max) {
    errors.push(`${subject} must be <= ${max}`);
  }
  return errors;
}

/** The few kinds of token the nested-repetition check tells apart. */
type PatternToken = '(' | ')' | 'open-ended' | 'fixed' | 'literal';

const SINGLE_CHARACTER_TOKENS = new Map<string, PatternToken>([
  ['(', '('],
  [')', ')'],
  ['+', 'open-ended'],
  ['*', 'open-ended'],
]);

/**
 * Reads a pattern once, left to right. Escaped characters and everything
 * inside `[...]` are literals; `{n}` is a fixed count, `{n,}` and `{n,m}` are
 * open-ended like `+` and `*`.
 */
function tokenizePattern(pattern: string): PatternToken[] {
  const tokens: PatternToken[] = [];
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === '\\') {
      tokens.push('literal');
      i += 2;
    } else if (char === '[') {
      tokens.push('literal');
      i = endOfCharacterClass(pattern, i) + 1;
    } else if (char === '{') {
      const close = pattern.indexOf('}', i);
      const end = close === -1 ? pattern.length : close;
      tokens.push(close === -1 || pattern.slice(i, end).includes(',') ? 'open-ended' : 'fixed');
      i = end + 1;
    } else {
      tokens.push(SINGLE_CHARACTER_TOKENS.get(char) ?? 'literal');
      i += 1;
    }
  }
  return tokens;
}

function endOfCharacterClass(pattern: string, start: number): number {
  let i = start + 1;
  while (i < pattern.length && pattern[i] !== ']') {
    i += pattern[i] === '\\' ? 2 : 1;
  }
  return i;
}

@Injectable()
export class CustomFieldsService {
  constructor(
    @InjectRepository(CustomFieldDefinition)
    private readonly definitionRepository: Repository<CustomFieldDefinition>,
    private readonly redisService: RedisService,
  ) {}

  private buildDefinitionsCacheKey(tenantId: string, entityType: CustomFieldEntityType): string {
    return buildPlatformCacheKey('custom-fields', tenantId, entityType);
  }

  async getDefinitions(
    tenantId: string,
    entityType: CustomFieldEntityType,
  ): Promise<CustomFieldDefinition[]> {
    const cacheKey = this.buildDefinitionsCacheKey(tenantId, entityType);
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as CustomFieldDefinition[];
    }

    const definitions = await this.definitionRepository.find({
      where: { tenantId, entityType },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });

    await this.redisService.set(cacheKey, JSON.stringify(definitions), 600);
    return definitions;
  }

  async createDefinition(
    tenantId: string,
    dto: CreateCustomFieldDefinitionDto,
  ): Promise<CustomFieldDefinition> {
    this.assertSafePattern(dto.validationRules);
    const duplicate = await this.definitionRepository.findOne({
      where: { tenantId, entityType: dto.entityType, fieldName: dto.fieldName },
    });
    if (duplicate) {
      throw new BadRequestException(
        `Field "${dto.fieldName}" already exists for entity "${dto.entityType}"`,
      );
    }

    const definition = this.definitionRepository.create({
      ...dto,
      tenantId,
      isRequired: dto.isRequired ?? false,
      displayOrder: dto.displayOrder ?? 0,
      isSearchable: dto.isSearchable ?? false,
    });

    const created = await this.definitionRepository.save(definition);
    await this.redisService.del(this.buildDefinitionsCacheKey(tenantId, dto.entityType));
    return created;
  }

  async updateDefinition(
    tenantId: string,
    id: string,
    dto: UpdateCustomFieldDefinitionDto,
  ): Promise<CustomFieldDefinition> {
    this.assertSafePattern(dto.validationRules);
    const existing = await this.definitionRepository.findOne({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Custom field definition not found');
    }

    const merged = this.definitionRepository.merge(existing, dto);
    const saved = await this.definitionRepository.save(merged);
    await this.redisService.del(this.buildDefinitionsCacheKey(saved.tenantId, saved.entityType));
    return saved;
  }

  async deleteDefinition(tenantId: string, id: string): Promise<void> {
    const existing = await this.definitionRepository.findOne({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Custom field definition not found');
    }

    await this.definitionRepository.remove(existing);
    await this.redisService.del(this.buildDefinitionsCacheKey(existing.tenantId, existing.entityType));
  }

  async validateCustomFields(
    tenantId: string,
    entityType: CustomFieldEntityType,
    fields: Record<string, unknown>,
  ): Promise<CustomFieldValidationResult> {
    const definitions = await this.getDefinitions(tenantId, entityType);
    if (definitions.length === 0) {
      return { valid: true, errors: [] };
    }

    const known = new Set(definitions.map((definition) => definition.fieldName));
    const errors = [
      ...definitions.flatMap((definition) =>
        this.validateField(definition, fields?.[definition.fieldName]),
      ),
      ...Object.keys(fields || {})
        .filter((key) => !known.has(key))
        .map((key) => `Field "${key}" is not defined for entity "${entityType}"`),
    ];

    return { valid: errors.length === 0, errors };
  }

  /** What is wrong with one field's value; empty when it is acceptable. */
  private validateField(def: CustomFieldDefinition, value: unknown): string[] {
    const missing = value === undefined || value === null;
    if (def.isRequired && (missing || value === '')) {
      return [`Field "${def.fieldName}" is required`];
    }
    if (missing) {
      return [];
    }
    if (!this.isTypeValid(def.fieldType, value)) {
      return [`Field "${def.fieldName}" must be of type "${def.fieldType}"`];
    }

    const errors: string[] = [];
    const allowed = def.fieldType === CustomFieldType.ENUM ? (def.enumValues ?? []) : [];
    if (allowed.length > 0 && !(typeof value === 'string' && allowed.includes(value))) {
      errors.push(`Field "${def.fieldName}" must be one of: ${allowed.join(', ')}`);
    }
    errors.push(...this.validateRules(def.fieldName, def.validationRules, value));
    return errors;
  }

  private static readonly MAX_PATTERN_LENGTH = 200;
  private static readonly MAX_PATTERN_INPUT = 1000;

  /**
   * True if a group that contains an open-ended repetition is itself repeated,
   * as in `(a+)+` or `((a*))*`: the shape that makes matching time explode.
   * A fixed count such as `\d{3}` is not open-ended, so `(\d{3}-)+` is accepted.
   */
  private static hasNestedQuantifier(pattern: string): boolean {
    const tokens = tokenizePattern(pattern);
    // One entry per open group: whether an open-ended repetition was seen inside it.
    const groups: boolean[] = [];
    const markCurrentGroup = () => {
      if (groups.length > 0) {
        groups[groups.length - 1] = true;
      }
    };

    for (const [index, token] of tokens.entries()) {
      if (token === '(') {
        groups.push(false);
      } else if (token === 'open-ended') {
        // After a group this lands on the enclosing group, which is what is wanted.
        markCurrentGroup();
      } else if (token === ')' && groups.pop()) {
        const next = tokens[index + 1];
        if (next === 'open-ended' || next === 'fixed') {
          return true;
        }
        markCurrentGroup();
      }
    }
    return false;
  }

  /**
   * Patterns come from tenant admins and run against user input on the request
   * path, so a pattern that backtracks exponentially would stall the server.
   * Only short patterns without nested quantifiers or backreferences are accepted.
   */
  private compilePattern(pattern: string): RegExp | null {
    if (
      typeof pattern !== 'string' ||
      pattern.length > CustomFieldsService.MAX_PATTERN_LENGTH ||
      CustomFieldsService.hasNestedQuantifier(pattern) ||
      /\\[1-9]/.test(pattern)
    ) {
      return null;
    }
    try {
      return new RegExp(pattern);
    } catch {
      return null;
    }
  }

  private assertSafePattern(rules: Record<string, unknown> | undefined): void {
    const pattern = rules?.pattern;
    if (pattern !== undefined && !this.compilePattern(pattern as string)) {
      throw new BadRequestException(
        'validationRules.pattern must be a valid regular expression of at most ' +
          `${CustomFieldsService.MAX_PATTERN_LENGTH} characters, without nested quantifiers or backreferences`,
      );
    }
  }

  private isTypeValid(type: CustomFieldType, value: unknown): boolean {
    switch (type) {
      case CustomFieldType.STRING:
      case CustomFieldType.TEXT:
      case CustomFieldType.ENUM:
        return typeof value === 'string';
      case CustomFieldType.NUMBER:
        return typeof value === 'number' && Number.isFinite(value);
      case CustomFieldType.BOOLEAN:
        return typeof value === 'boolean';
      case CustomFieldType.DATE:
        return typeof value === 'string' && !Number.isNaN(Date.parse(value));
      default:
        return false;
    }
  }

  private validateRules(
    fieldName: string,
    rules: Record<string, unknown> | undefined,
    value: unknown,
  ): string[] {
    if (!rules) return [];
    const min = typeof rules.min === 'number' ? rules.min : undefined;
    const max = typeof rules.max === 'number' ? rules.max : undefined;
    const subject = `Field "${fieldName}"`;

    if (typeof value === 'number') {
      return rangeErrors(subject, value, min, max);
    }
    if (typeof value !== 'string') {
      return [];
    }
    const errors = rangeErrors(`${subject} length`, value.length, min, max);
    if (rules.pattern && !this.matchesPattern(rules.pattern as string, value)) {
      errors.push(`${subject} does not match required pattern`);
    }
    return errors;
  }

  /** A missing or unusable pattern, or an oversized value, is a failed match. */
  private matchesPattern(pattern: string, value: string): boolean {
    const regex = this.compilePattern(pattern);
    return Boolean(regex) && value.length <= CustomFieldsService.MAX_PATTERN_INPUT && regex!.test(value);
  }
}

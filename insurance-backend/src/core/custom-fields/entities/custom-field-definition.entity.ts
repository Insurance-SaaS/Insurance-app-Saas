import { CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { BooleanColumn, IntColumn, JsonColumn, StringColumn, UuidColumn } from 'src/shared/decorators/portable-column.decorator';

export enum CustomFieldEntityType {
  CLAIM = 'claim',
  QUOTE = 'quote',
  CONTRACT = 'contract',
  BRANCH = 'branch',
  USER = 'user',
}

export enum CustomFieldType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  ENUM = 'enum',
  TEXT = 'text',
}

@Entity('custom_field_definitions')
@Index(['tenantId', 'entityType', 'fieldName'], { unique: true })
export class CustomFieldDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @UuidColumn()
  @Index()
  tenantId: string;

  @StringColumn(30)
  entityType: CustomFieldEntityType;

  @StringColumn(80)
  fieldName: string;

  @StringColumn(20)
  fieldType: CustomFieldType;

  @BooleanColumn({ default: false })
  isRequired: boolean;

  @StringColumn(255, { nullable: true })
  defaultValue?: string;

  @JsonColumn({ nullable: true })
  enumValues?: string[];

  @JsonColumn({ nullable: true })
  validationRules?: Record<string, unknown>;

  @IntColumn({ default: 0 })
  displayOrder: number;

  @StringColumn(120)
  labelEn: string;

  @StringColumn(120)
  labelFr: string;

  @StringColumn(120)
  labelAr: string;

  @BooleanColumn({ default: false })
  isSearchable: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

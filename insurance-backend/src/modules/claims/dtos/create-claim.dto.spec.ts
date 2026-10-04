import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateClaimDto } from './create-claim.dto';

describe('CreateClaimDto', () => {
  const base = { typeIncident: 'Accident', dateIncident: '2025-09-27', location: 'Alger' };
  const parse = (values: Record<string, unknown>) => {
    const dto = plainToInstance(CreateClaimDto, { ...base, ...values });
    const errors = validateSync(dto, { whitelist: true }).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );
    return { dto, errors };
  };

  it('accepts the minimal form', () => {
    expect(parse({}).errors).toEqual([]);
  });

  it.each(['typeIncident', 'dateIncident', 'location'])('requires %s', (field) => {
    const { errors } = parse({ [field]: '' });

    expect(errors.join(' ')).toContain(field);
  });

  it('rejects a date that is not a date', () => {
    expect(parse({ dateIncident: 'yesterday' }).errors).toEqual([
      'dateIncident must be a valid ISO 8601 date string (e.g., YYYY-MM-DD)',
    ]);
  });

  describe('list fields', () => {
    it('reads a JSON array sent as one text field', () => {
      expect(parse({ rayures: '["Capot","Aile"]' }).dto.rayures).toEqual(['Capot', 'Aile']);
    });

    it('reads a repeated field', () => {
      expect(parse({ bosses: ['Capot', 'Aile'] }).dto.bosses).toEqual(['Capot', 'Aile']);
    });

    it('keeps a single plain value instead of dropping it', () => {
      expect(parse({ partsEndommagees: 'Capot' }).dto.partsEndommagees).toEqual(['Capot']);
    });

    it('treats an empty field as an empty list', () => {
      expect(parse({ dommagesPoignee: '' }).dto.dommagesPoignee).toEqual([]);
    });

    it('rejects a broken JSON array and a list of non-strings', () => {
      expect(parse({ rayures: '["Capot"' }).errors.length).toBeGreaterThan(0);
      expect(parse({ rayures: '[1, {"a": 2}]' }).errors.length).toBeGreaterThan(0);
    });
  });

  describe('customFields', () => {
    it('reads a JSON object sent as text', () => {
      expect(parse({ customFields: '{"plate":"123"}' }).dto.customFields).toEqual({ plate: '123' });
    });

    it.each(['not json', '[1,2]', '"text"'])('rejects %s', (value) => {
      expect(parse({ customFields: value }).errors).toEqual(['customFields must be a JSON object']);
    });
  });

  it('drops fields the form does not define', () => {
    expect(parse({ status: 'approved', userId: 'someone-else' }).dto).not.toHaveProperty('status');
  });
});

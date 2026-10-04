import { Column, ColumnOptions } from 'typeorm';

/**
 * Column helpers that work on every supported database engine.
 *
 * Entities must use only these (plus TypeORM's key, relation and
 * create/update-date decorators). They map to the abstract types that each
 * TypeORM driver resolves for itself, so the same entity classes can back a
 * Postgres tenant and an Oracle tenant in the same process. Engine-specific
 * type names such as 'text', 'clob', 'enum', 'jsonb' or 'timestamptz' are
 * rejected by at least one driver and are forbidden; a test enforces this.
 */

type Options = Omit<
  ColumnOptions,
  'type' | 'length' | 'precision' | 'scale' | 'transformer' | 'enum' | 'array'
>;

/** Longest bounded string that fits every engine (Oracle: 4000 bytes at 4 bytes per character). */
export const MAX_STRING_LENGTH = 1000;

/** Unicode string of bounded length (varchar / varchar2 / nvarchar). */
export function StringColumn(length = 255, options: Options = {}) {
  if (length > MAX_STRING_LENGTH) {
    throw new Error(`StringColumn length ${length} exceeds ${MAX_STRING_LENGTH}; use LongTextColumn`);
  }
  return Column({ type: String, length, ...options });
}

/**
 * Text with no practical length limit. Each engine stores it in its own large
 * text type (text / clob / ntext). The value is kept JSON-encoded, so it must
 * not be filtered or sorted on in SQL.
 */
export function LongTextColumn(options: Options = {}) {
  return Column({ type: 'simple-json', ...options });
}

/** Structured value (object or array), stored as JSON text. Not queryable in SQL. */
export function JsonColumn(options: Options = {}) {
  return Column({ type: 'simple-json', ...options });
}

export function BooleanColumn(options: Options = {}) {
  return Column({ type: Boolean, ...options });
}

export function IntColumn(options: Options = {}) {
  return Column({ type: 'int', ...options });
}

/**
 * Fixed-point number. Postgres and MySQL return decimals as strings, Oracle and
 * SQL Server as numbers; the transformer makes every engine return a number.
 */
export function DecimalColumn(precision: number, scale: number, options: Options = {}) {
  return Column({
    type: 'decimal',
    precision,
    scale,
    transformer: {
      to: (value?: number | null) => value,
      from: (value?: string | number | null) =>
        value === null || value === undefined ? value : Number(value),
    },
    ...options,
  });
}

/**
 * A point in time. No engine-neutral time-zone-aware type exists, so the value
 * is stored without a zone and the application always reads and writes UTC.
 */
export function InstantColumn(options: Options = {}) {
  return Column({ type: Date, ...options });
}

/** A calendar date without time. TypeORM returns it as a 'YYYY-MM-DD' string. */
export function DateOnlyColumn(options: Options = {}) {
  return Column({ type: 'date', ...options });
}

/**
 * A value from a TypeScript enum, stored as a string. Native enum types exist
 * on only some engines; validate the value with @IsEnum on the DTO.
 */
export function EnumColumn(_enumObject: object, options: Options = {}) {
  return Column({ type: String, length: 50, ...options });
}

/** A UUID that is not a declared relation (uuid / varchar / uniqueidentifier). */
export function UuidColumn(options: Options = {}) {
  return Column({ type: 'uuid', ...options });
}

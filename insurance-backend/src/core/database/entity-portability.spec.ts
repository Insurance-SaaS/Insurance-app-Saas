import 'reflect-metadata';
import { DataSource, getMetadataArgsStorage } from 'typeorm';
import { MAX_STRING_LENGTH } from 'src/shared/decorators/portable-column.decorator';
import { DatabaseEngine, SUPPORTED_ENGINES } from './dialects';
import { PLATFORM_ENTITIES, TENANT_ENTITIES } from './entity-sets';

/** Column types every supported driver accepts and resolves to its own physical type. */
const PORTABLE_TYPES = new Set<unknown>([
  String,
  Number,
  Boolean,
  Date,
  'int',
  'decimal',
  'date',
  'uuid',
  'simple-json',
]);

function classChain(entity: Function): Function[] {
  const chain: Function[] = [];
  for (let c: any = entity; c && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
    chain.push(c);
  }
  return chain;
}

describe.each([
  ['platform', PLATFORM_ENTITIES],
  ['tenant', TENANT_ENTITIES],
] as const)('%s entities', (_set, entities) => {
  // No database is needed: TypeORM validates every column type against the driver
  // while it builds the entity metadata, which is the step that fails at startup.
  it.each(SUPPORTED_ENGINES)('are accepted by the %s driver', async (engine: DatabaseEngine) => {
    const dataSource = new DataSource({
      type: engine,
      entities: [...entities],
      host: 'unused',
      username: 'unused',
      password: 'unused',
      database: 'unused',
      ...(engine === 'oracle' ? { serviceName: 'unused' } : {}),
    } as any);

    await expect((dataSource as any).buildMetadatas()).resolves.toBeUndefined();
    expect(dataSource.entityMetadatas).toHaveLength(entities.length);
  });

  it('use only engine-neutral column types with bounded strings', () => {
    const targets = new Set(entities.flatMap((entity) => classChain(entity)));
    const problems: string[] = [];

    for (const column of getMetadataArgsStorage().columns) {
      if (!targets.has(column.target as Function) || column.mode !== 'regular') {
        continue; // create/update date columns are resolved by TypeORM per engine
      }
      const where = `${(column.target as Function).name}.${column.propertyName}`;
      const type =
        column.options.type ??
        Reflect.getMetadata('design:type', (column.target as Function).prototype, column.propertyName);

      if (!PORTABLE_TYPES.has(type)) {
        problems.push(`${where}: type ${String((type as any)?.name ?? type)} is not engine-neutral`);
      }
      if (type === String) {
        const length = Number(column.options.length);
        if (!length || length > MAX_STRING_LENGTH) {
          problems.push(`${where}: string columns need a length of at most ${MAX_STRING_LENGTH}`);
        }
      }
    }

    expect(problems).toEqual([]);
  });
});

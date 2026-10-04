import { EntityTarget, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';
import { TableUtils } from 'typeorm/schema-builder/util/TableUtils';

/**
 * Building blocks for migrations that run unchanged on every engine.
 *
 * Each helper
 * - takes its definition from the entity, so the physical type is whatever
 *   TypeORM would itself create on that engine (no SQL, no type names here);
 * - checks before it acts, so a migration can be re-run after a partial
 *   failure. MySQL and Oracle commit each DDL statement and cannot roll back.
 *
 * A migration therefore says "bring this part of the schema to what the entity
 * declares", and is a no-op on a database that is already there.
 */
export class SchemaKit {
  constructor(private readonly queryRunner: QueryRunner) {}

  private get connection() {
    return this.queryRunner.connection;
  }

  /** Creates the entity's table, with its indexes and foreign keys, if it does not exist. */
  async createEntityTable(entity: EntityTarget<any>): Promise<void> {
    const metadata = this.connection.getMetadata(entity);
    if (await this.queryRunner.hasTable(metadata.tablePath)) {
      return;
    }
    const table = Table.create(metadata, this.connection.driver);
    await this.queryRunner.createTable(table, false, false, true);
    const foreignKeys = metadata.foreignKeys.map((fk) =>
      TableForeignKey.create(fk, this.connection.driver),
    );
    if (foreignKeys.length) {
      await this.queryRunner.createForeignKeys(table, foreignKeys);
    }
  }

  async dropTable(tableName: string): Promise<void> {
    if (await this.queryRunner.hasTable(tableName)) {
      await this.queryRunner.dropTable(tableName, true, true, true);
    }
  }

  /**
   * Adds the column the entity declares for `property` if the table lacks it.
   * A new column on a table that already has rows must be nullable or have a default.
   */
  async addEntityColumn(entity: EntityTarget<any>, property: string): Promise<void> {
    const metadata = this.connection.getMetadata(entity);
    const column = metadata.findColumnWithPropertyName(property);
    if (!column) {
      return; // the entity no longer has this property; a later migration removes it
    }
    if (await this.queryRunner.hasColumn(metadata.tablePath, column.databaseName)) {
      return;
    }
    const tableColumn = new TableColumn(
      TableUtils.createTableColumnOptions(column, this.connection.driver),
    );
    // Engines that keep "unique" as an index (the MySQL family) would create
    // that index here under a generated name, next to the one the entity
    // declares under its own name. The column is added plain and the entity's
    // indexes on it are created below instead.
    const ownIndexes = metadata.indices.filter(
      (index) => index.columns.length === 1 && index.columns[0] === column,
    );
    if (ownIndexes.some((index) => index.isUnique)) {
      tableColumn.isUnique = false;
    }
    await this.queryRunner.addColumn(metadata.tablePath, tableColumn);

    for (const index of ownIndexes) {
      const table = await this.queryRunner.getTable(metadata.tablePath);
      if (table && !table.indices.some((existing) => existing.name === index.name)) {
        await this.queryRunner.createIndex(table, TableIndex.create(index));
      }
    }
  }

  async dropColumn(tableName: string, columnName: string): Promise<void> {
    if (await this.queryRunner.hasColumn(tableName, columnName)) {
      await this.queryRunner.dropColumn(tableName, columnName);
    }
  }

  async renameColumn(tableName: string, from: string, to: string): Promise<void> {
    const hasOld = await this.queryRunner.hasColumn(tableName, from);
    const hasNew = await this.queryRunner.hasColumn(tableName, to);
    if (hasOld && !hasNew) {
      await this.queryRunner.renameColumn(tableName, from, to);
    }
  }

  /** Creates every index the entity declares that the table does not have yet. */
  async createEntityIndexes(entity: EntityTarget<any>): Promise<void> {
    const metadata = this.connection.getMetadata(entity);
    const table = await this.queryRunner.getTable(metadata.tablePath);
    if (!table) {
      return;
    }
    const existing = new Set(table.indices.map((index) => index.name));
    for (const index of metadata.indices) {
      if (!existing.has(index.name)) {
        await this.queryRunner.createIndex(table, TableIndex.create(index));
      }
    }
  }

  /** Drops the index the entity declares on exactly these properties, if the table has it. */
  async dropEntityIndex(entity: EntityTarget<any>, properties: string[]): Promise<void> {
    const metadata = this.connection.getMetadata(entity);
    const index = metadata.indices.find(
      (candidate) =>
        candidate.columns.length === properties.length &&
        candidate.columns.every((column, i) => column.propertyName === properties[i]),
    );
    if (index) {
      await this.dropIndex(metadata.tablePath, index.name);
    }
  }

  async dropIndex(tableName: string, indexName: string): Promise<void> {
    const table = await this.queryRunner.getTable(tableName);
    if (table?.indices.some((index) => index.name === indexName)) {
      await this.queryRunner.dropIndex(table, indexName);
    }
  }
}

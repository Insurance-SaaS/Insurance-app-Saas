import { MigrationInterface, QueryRunner } from 'typeorm';
import { SchemaKit } from 'src/core/database/schema/schema-kit';
import { Contract } from 'src/integrations/erp/entities/contract.entity';
import { Claim } from 'src/modules/claims/entities/claim.entity';
import { Document } from 'src/modules/claims/entities/document.entity';
import { PaymentTransaction } from 'src/modules/payment/entities/payment-transaction.entity';

/**
 * - claims.damageDetails: the damage detail of the declaration form is now stored.
 * - payment_transactions.idempotencyKey, unique: a retried payment request no
 *   longer creates a second payment.
 * - Indexes on the columns lists are filtered by: claims.user, documents.claim,
 *   contracts.user, payment_transactions.userId.
 */
export class ClaimDetailsAndIndexes1759622400000 implements MigrationInterface {
  name = 'ClaimDetailsAndIndexes1759622400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const kit = new SchemaKit(queryRunner);
    await kit.addEntityColumn(Claim, 'damageDetails');
    await kit.addEntityColumn(PaymentTransaction, 'idempotencyKey');
    for (const entity of [Claim, Document, Contract, PaymentTransaction]) {
      await kit.createEntityIndexes(entity);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const kit = new SchemaKit(queryRunner);
    await kit.dropEntityIndex(PaymentTransaction, ['idempotencyKey']);
    await kit.dropColumn('payment_transactions', 'idempotencyKey');
    await kit.dropColumn('claims', 'damageDetails');
    // The lookup indexes are left in place: they are harmless, and MySQL will
    // not drop an index that a foreign key relies on.
  }
}

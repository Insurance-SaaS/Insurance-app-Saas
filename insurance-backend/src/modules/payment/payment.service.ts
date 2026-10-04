import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { TenantRepositoryFactory } from 'src/core/database/tenant-repository.factory';
import { Claim } from 'src/modules/claims/entities/claim.entity';
import { Quote } from 'src/modules/quotes/entities/quote.entity';
import { PaymentStatus, PaymentTransaction } from './entities/payment-transaction.entity';

/** The payment lifecycle: from each status, the statuses it may move to. */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [
    PaymentStatus.PROCESSING,
    PaymentStatus.COMPLETED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.PROCESSING]: [
    PaymentStatus.COMPLETED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.COMPLETED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.CANCELLED]: [],
  [PaymentStatus.REFUNDED]: [],
};

interface Page {
  skip: number;
  limit: number;
}
const FIRST_PAGE: Page = { skip: 0, limit: 50 };

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(private readonly tenantRepoFactory: TenantRepositoryFactory) {}

  private get repo() {
    return this.tenantRepoFactory.getRepository(PaymentTransaction);
  }

  /** Generate a human-readable reference number (e.g. PAY-3F8A2B1C) */
  private generateReference(): string {
    return `PAY-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  /**
   * Records a payment. With an idempotency key, sending the same request again
   * returns the payment created the first time instead of creating another one.
   */
  async create(data: Partial<PaymentTransaction>): Promise<PaymentTransaction> {
    // Stored as a digest that includes the payer: keys of different users never collide.
    const idempotencyKey = data.idempotencyKey
      ? createHash('sha256').update(`${data.userId}:${data.idempotencyKey}`).digest('hex')
      : null;
    const existing = () =>
      idempotencyKey ? this.repo.findOne({ where: { idempotencyKey } }) : Promise.resolve(null);

    const previous = await existing();
    if (previous) {
      return previous;
    }
    await this.assertReferences(data);

    const payment = this.repo.create({
      ...data,
      idempotencyKey,
      referenceNumber: this.generateReference(),
      status: PaymentStatus.PENDING,
    });
    try {
      const saved = await this.repo.save(payment);
      this.logger.log(`Payment ${saved.referenceNumber} created for user ${saved.userId}`);
      return saved;
    } catch (error) {
      // Two identical requests at the same moment: the unique index lets one in.
      const winner = this.tenantRepoFactory.isUniqueViolation(error) ? await existing() : null;
      if (winner) {
        return winner;
      }
      throw error;
    }
  }

  /** A payment may only point at a quote that exists and at a claim of the payer. */
  private async assertReferences(data: Partial<PaymentTransaction>): Promise<void> {
    if (data.quoteId) {
      const quotes = this.tenantRepoFactory.getRepository(Quote);
      if (!(await quotes.exists({ where: { id: data.quoteId } }))) {
        throw new BadRequestException('The quote of this payment does not exist');
      }
    }
    if (data.claimId) {
      const claims = this.tenantRepoFactory.getRepository(Claim);
      // Someone else's claim is reported exactly like a missing one.
      if (!(await claims.exists({ where: { id: data.claimId, user: { id: data.userId } } }))) {
        throw new BadRequestException('The claim of this payment does not exist');
      }
    }
  }

  async findById(id: string): Promise<PaymentTransaction> {
    const payment = await this.repo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }

  async findByUser(userId: string, page: Page = FIRST_PAGE): Promise<PaymentTransaction[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: page.skip,
      take: page.limit,
    });
  }

  async findByReference(referenceNumber: string): Promise<PaymentTransaction> {
    const payment = await this.repo.findOne({ where: { referenceNumber } });
    if (!payment) throw new NotFoundException(`Payment ${referenceNumber} not found`);
    return payment;
  }

  /**
   * Moves a payment along its lifecycle. Only the transitions below exist; a
   * finished payment (failed, cancelled, refunded) never changes again.
   */
  async updateStatus(
    id: string,
    status: PaymentStatus,
    gatewayTransactionId?: string,
  ): Promise<PaymentTransaction> {
    const payment = await this.findById(id);

    if (payment.status === status) {
      return payment; // repeating the current status changes nothing
    }
    if (!PAYMENT_TRANSITIONS[payment.status].includes(status)) {
      throw new BadRequestException(
        `A ${payment.status} payment cannot become ${status}. Allowed: ` +
          (PAYMENT_TRANSITIONS[payment.status].join(', ') || 'none'),
      );
    }

    payment.status = status;
    if (gatewayTransactionId) {
      payment.gatewayTransactionId = gatewayTransactionId;
    }
    if (status === PaymentStatus.COMPLETED) {
      payment.paidAt = new Date();
    }
    return this.repo.save(payment);
  }

  async findAll(page: Page = FIRST_PAGE): Promise<PaymentTransaction[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, skip: page.skip, take: page.limit });
  }
}

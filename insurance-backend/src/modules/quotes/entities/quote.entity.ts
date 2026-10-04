import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { CoverageDetail } from './coverage-detail.entity';
import { Payment } from './payment.entity';
import { SummaryTerms } from './summary-terms.entity';
import { Product } from './product.entity';
import { SupportedLanguage } from 'src/shared/utils/multilingual.util';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { DecimalColumn, IntColumn, LongTextColumn, StringColumn } from 'src/shared/decorators/portable-column.decorator';

@Entity('quotes')
export class Quote extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Multilingual title fields only (no redundant original field)
  @StringColumn(255, { name: 'title_en' })
  titleEn: string;

  @StringColumn(255, { name: 'title_fr' })
  titleFr: string;

  @StringColumn(255, { name: 'title_ar' })
  titleAr: string;

  @DecimalColumn(12, 2)
  priceMonthly: number;

  @DecimalColumn(12, 2)
  deductible: number;

  @IntColumn()
  termMonths: number; // e.g. 12

  // Multilingual plan type fields only (no redundant original field)
  @StringColumn(100, { name: 'planType_en' })
  planTypeEn: string;

  @StringColumn(100, { name: 'planType_fr' })
  planTypeFr: string;

  @StringColumn(100, { name: 'planType_ar' })
  planTypeAr: string;

  // Multilingual start condition fields only (no redundant original field)
  @LongTextColumn({ name: 'startCondition_en' })
  startConditionEn: string;

  @LongTextColumn({ name: 'startCondition_fr' })
  startConditionFr: string;

  @LongTextColumn({ name: 'startCondition_ar' })
  startConditionAr: string;

  @OneToMany(() => CoverageDetail, (coverage) => coverage.devis, {
    cascade: true,
  })
  coverageDetails: CoverageDetail[];

  @OneToMany(() => Payment, (payment) => payment.devis, {
    cascade: true,
  })
  payments: Payment[];

  @OneToOne(() => SummaryTerms, (terms) => terms.devis, {
    cascade: true,
    eager: true,
  })
  @JoinColumn()
  summaryTerms: SummaryTerms;

  @ManyToOne(() => Product, (product) => product.quotes, {
    eager: true,
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  // Getter for product type (uses English by default)
  get productType(): string {
    return this.product?.typeEn || '';
  }

  // Get product type in specific language
  getProductType(language: SupportedLanguage = 'en'): string {
    return this.product?.getType(language) || '';
  }

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper methods to get fields in specific language
  getTitle(language: SupportedLanguage = 'en'): string {
    switch (language) {
      case 'en':
        return this.titleEn;
      case 'fr':
        return this.titleFr;
      case 'ar':
        return this.titleAr;
      default:
        return this.titleEn;
    }
  }

  getPlanType(language: SupportedLanguage = 'en'): string {
    switch (language) {
      case 'en':
        return this.planTypeEn;
      case 'fr':
        return this.planTypeFr;
      case 'ar':
        return this.planTypeAr;
      default:
        return this.planTypeEn;
    }
  }

  getStartCondition(language: SupportedLanguage = 'en'): string {
    switch (language) {
      case 'en':
        return this.startConditionEn;
      case 'fr':
        return this.startConditionFr;
      case 'ar':
        return this.startConditionAr;
      default:
        return this.startConditionEn;
    }
  }
}

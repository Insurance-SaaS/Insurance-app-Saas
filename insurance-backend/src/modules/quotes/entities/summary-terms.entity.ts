import { Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Quote } from './quote.entity';
import { SupportedLanguage } from 'src/shared/utils/multilingual.util';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { LongTextColumn } from 'src/shared/decorators/portable-column.decorator';

@Entity('summary_terms')
export class SummaryTerms extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Multilingual fields for contract validity (no redundant original field)
  @LongTextColumn({ name: 'contractValidity_en' })
  contractValidityEn: string;

  @LongTextColumn({ name: 'contractValidity_fr' })
  contractValidityFr: string;

  @LongTextColumn({ name: 'contractValidity_ar' })
  contractValidityAr: string;

  // Multilingual fields for cancel policy (no redundant original field)
  @LongTextColumn({ name: 'cancelPolicy_en' })
  cancelPolicyEn: string;

  @LongTextColumn({ name: 'cancelPolicy_fr' })
  cancelPolicyFr: string;

  @LongTextColumn({ name: 'cancelPolicy_ar' })
  cancelPolicyAr: string;

  // Multilingual fields for claims processing (no redundant original field)
  @LongTextColumn({ name: 'claimsProcessing_en' })
  claimsProcessingEn: string;

  @LongTextColumn({ name: 'claimsProcessing_fr' })
  claimsProcessingFr: string;

  @LongTextColumn({ name: 'claimsProcessing_ar' })
  claimsProcessingAr: string;

  // Multilingual fields for docs storage (no redundant original field)
  @LongTextColumn({ name: 'docsStorage_en' })
  docsStorageEn: string;

  @LongTextColumn({ name: 'docsStorage_fr' })
  docsStorageFr: string;

  @LongTextColumn({ name: 'docsStorage_ar' })
  docsStorageAr: string;

  @OneToOne(() => Quote, (devis) => devis.summaryTerms)
  devis: Quote;

  // Helper methods to get fields in specific language
  getContractValidity(language: SupportedLanguage = 'en'): string {
    switch (language) {
      case 'en':
        return this.contractValidityEn;
      case 'fr':
        return this.contractValidityFr;
      case 'ar':
        return this.contractValidityAr;
      default:
        return this.contractValidityEn;
    }
  }

  getCancelPolicy(language: SupportedLanguage = 'en'): string {
    switch (language) {
      case 'en':
        return this.cancelPolicyEn;
      case 'fr':
        return this.cancelPolicyFr;
      case 'ar':
        return this.cancelPolicyAr;
      default:
        return this.cancelPolicyEn;
    }
  }

  getClaimsProcessing(language: SupportedLanguage = 'en'): string {
    switch (language) {
      case 'en':
        return this.claimsProcessingEn;
      case 'fr':
        return this.claimsProcessingFr;
      case 'ar':
        return this.claimsProcessingAr;
      default:
        return this.claimsProcessingEn;
    }
  }

  getDocsStorage(language: SupportedLanguage = 'en'): string {
    switch (language) {
      case 'en':
        return this.docsStorageEn;
      case 'fr':
        return this.docsStorageFr;
      case 'ar':
        return this.docsStorageAr;
      default:
        return this.docsStorageEn;
    }
  }
}

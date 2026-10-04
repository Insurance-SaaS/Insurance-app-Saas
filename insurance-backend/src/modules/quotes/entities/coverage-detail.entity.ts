import { Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Quote } from './quote.entity';
import { SupportedLanguage } from 'src/shared/utils/multilingual.util';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { BooleanColumn, StringColumn } from 'src/shared/decorators/portable-column.decorator';

@Entity('coverage_details')
export class CoverageDetail extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Multilingual label fields only (no redundant original field)
  @StringColumn(255, { name: 'label_en' })
  labelEn: string;

  @StringColumn(255, { name: 'label_fr' })
  labelFr: string;

  @StringColumn(255, { name: 'label_ar' })
  labelAr: string;

  @BooleanColumn({ default: false })
  included: boolean;

  @ManyToOne(() => Quote, (devis) => devis.coverageDetails)
  devis: Quote;

  // Helper method to get label in specific language
  getLabel(language: SupportedLanguage = 'en'): string {
    switch (language) {
      case 'en':
        return this.labelEn;
      case 'fr':
        return this.labelFr;
      case 'ar':
        return this.labelAr;
      default:
        return this.labelEn;
    }
  }
}

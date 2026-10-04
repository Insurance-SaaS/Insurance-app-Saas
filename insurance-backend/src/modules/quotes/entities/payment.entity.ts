import { Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Quote } from './quote.entity';
import { SupportedLanguage } from 'src/shared/utils/multilingual.util';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { DecimalColumn, StringColumn } from 'src/shared/decorators/portable-column.decorator';

@Entity('payments')
export class Payment extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Multilingual type fields only (no redundant original field)
  @StringColumn(255, { name: 'type_en' })
  typeEn: string;

  @StringColumn(255, { name: 'type_fr' })
  typeFr: string;

  @StringColumn(255, { name: 'type_ar' })
  typeAr: string;

  @DecimalColumn(12, 2)
  amount: number;

  // Multilingual mode fields only (no redundant original field)
  @StringColumn(255, { name: 'mode_en' })
  modeEn: string;

  @StringColumn(255, { name: 'mode_fr' })
  modeFr: string;

  @StringColumn(255, { name: 'mode_ar' })
  modeAr: string;

  @ManyToOne(() => Quote, (devis) => devis.payments)
  devis: Quote;

  // Helper methods to get fields in specific language
  getType(language: SupportedLanguage = 'en'): string {
    switch (language) {
      case 'en':
        return this.typeEn;
      case 'fr':
        return this.typeFr;
      case 'ar':
        return this.typeAr;
      default:
        return this.typeEn;
    }
  }

  getMode(language: SupportedLanguage = 'en'): string {
    switch (language) {
      case 'en':
        return this.modeEn;
      case 'fr':
        return this.modeFr;
      case 'ar':
        return this.modeAr;
      default:
        return this.modeEn;
    }
  }
}

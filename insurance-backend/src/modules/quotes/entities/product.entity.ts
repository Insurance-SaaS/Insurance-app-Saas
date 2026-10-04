import { Entity, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Quote } from './quote.entity';
import { SupportedLanguage } from 'src/shared/utils/multilingual.util';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { StringColumn } from 'src/shared/decorators/portable-column.decorator';

@Entity('products')
export class Product extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Multilingual fields only (no redundant original field)
  @StringColumn(255, { name: 'type_en' })
  typeEn: string;

  @StringColumn(255, { name: 'type_fr' })
  typeFr: string;

  @StringColumn(255, { name: 'type_ar' })
  typeAr: string;

  @OneToMany(() => Quote, (quote) => quote.product, {
    cascade: true,
  })
  quotes: Quote[];

  // Helper method to get type in specific language
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
}

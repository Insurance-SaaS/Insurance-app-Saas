// src/contracts/entities/contract.entity.ts
import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { Quote } from 'src/modules/quotes/entities/quote.entity';
import { SupportedLanguage } from 'src/shared/utils/multilingual.util';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { DateOnlyColumn, EnumColumn, StringColumn } from 'src/shared/decorators/portable-column.decorator';

export enum ContractStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
}

@Entity('contracts')
@Index(['user'])
export class Contract extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Multilingual title fields only (no redundant original field)
  @StringColumn(255, { name: 'title_en' })
  titleEn: string;

  @StringColumn(255, { name: 'title_fr' })
  titleFr: string;

  @StringColumn(255, { name: 'title_ar' })
  titleAr: string;

  // Multilingual type fields only (no redundant original field)
  @StringColumn(255, { name: 'type_en' })
  typeEn: string;

  @StringColumn(255, { name: 'type_fr' })
  typeFr: string;

  @StringColumn(255, { name: 'type_ar' })
  typeAr: string;

  @ManyToOne(() => User, (user) => user.contracts, {
    eager: true,
    onDelete: 'CASCADE', // ✅ Automatically delete contracts when user is deleted
  })
  user: User;

  @ManyToOne(() => Quote, { eager: true }) // no reverse relation in Quote entity
  devis: Quote;

  @StringColumn()
  externalAccountId: string;

  @DateOnlyColumn()
  startDate: Date;

  @DateOnlyColumn()
  endDate: Date;

  @EnumColumn(ContractStatus, { default: ContractStatus.ACTIVE })
  status: ContractStatus;

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

  // Helper method to get status label in specific language
  getStatusLabel(language: SupportedLanguage = 'en'): string {
    const statusLabels = {
      [ContractStatus.ACTIVE]: {
        en: 'Active',
        fr: 'Actif',
        ar: 'نشط',
      },
      [ContractStatus.EXPIRED]: {
        en: 'Expired',
        fr: 'Expiré',
        ar: 'منتهي الصلاحية',
      },
    };

    return statusLabels[this.status]?.[language] || this.status;
  }
}

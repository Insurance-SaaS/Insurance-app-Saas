import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { Expert } from './expert.entity';
import { Document } from './document.entity';
import { SupportedLanguage } from 'src/shared/utils/multilingual.util';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { DateOnlyColumn, DecimalColumn, EnumColumn, InstantColumn, JsonColumn, LongTextColumn, StringColumn } from 'src/shared/decorators/portable-column.decorator';

export enum ClaimStatus {
  SUBMITTED = 'SUBMITTED',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CLOSED = 'CLOSED',
}

@Entity('claims')
@Index(['user'])
export class Claim extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Numéro de dossier unique (#CLM92847)
  @StringColumn(50, { unique: true })
  numDossier: string;

  // Relation avec l’assuré
  @ManyToOne(() => User, (user) => user.claims, { eager: true, onDelete: 'CASCADE' })
  user: User;

  // Expert assigné (un seul expert possible)
  @ManyToOne(() => Expert, (expert) => expert.claims, {
    eager: true,
    nullable: true,
  })
  expert: Expert;

  // Documents liés
  @OneToMany(() => Document, (document) => document.claim, { cascade: true })
  documents: Document[];

  // Multilingual incident type fields only (no redundant original field)
  @StringColumn(255, { name: 'typeIncident_en' })
  typeIncidentEn: string;

  @StringColumn(255, { name: 'typeIncident_fr' })
  typeIncidentFr: string;

  @StringColumn(255, { name: 'typeIncident_ar' })
  typeIncidentAr: string;

  @DateOnlyColumn()
  dateIncident: Date;

  @InstantColumn({ nullable: true })
  timeIncident: Date | null;

  @StringColumn(500)
  location: string; // User-generated, not translated

  @LongTextColumn({ nullable: true })
  description: string; // User-generated, not translated

  // Damaged parts (array of strings) - automatically adapts to database type
  @JsonColumn({ nullable: true })
  partsEndommagees: string[] | null;

  /** Detail of the damage as entered on the declaration form. */
  @JsonColumn({ nullable: true })
  damageDetails: { rayures?: string[]; bosses?: string[]; dommagesPoignee?: string[] } | null;

  // Statut global du sinistre
  @EnumColumn(ClaimStatus, { default: ClaimStatus.SUBMITTED })
  status: ClaimStatus;

  // Indemnisation
  @DecimalColumn(12, 2, { nullable: true })
  montantApprouve: number;

  @DecimalColumn(12, 2, { nullable: true })
  coutReparation: number;

  @DecimalColumn(12, 2, { nullable: true })
  coutEvaluation: number;

  @DecimalColumn(12, 2, { nullable: true })
  fraisSupplementaires: number;

  @DateOnlyColumn({ nullable: true })
  dateEvaluationEstimee: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper method to get incident type in specific language
  getTypeIncident(language: SupportedLanguage = 'en'): string {
    switch (language) {
      case 'en':
        return this.typeIncidentEn;
      case 'fr':
        return this.typeIncidentFr;
      case 'ar':
        return this.typeIncidentAr;
      default:
        return this.typeIncidentEn;
    }
  }

  // Helper method to get status label in specific language
  getStatusLabel(language: SupportedLanguage = 'en'): string {
    const statusLabels = {
      [ClaimStatus.SUBMITTED]: {
        en: 'Submitted',
        fr: 'Soumis',
        ar: 'مقدم',
      },
      [ClaimStatus.IN_REVIEW]: {
        en: 'In Review',
        fr: "En cours d'examen",
        ar: 'قيد المراجعة',
      },
      [ClaimStatus.APPROVED]: {
        en: 'Approved',
        fr: 'Approuvé',
        ar: 'موافق عليه',
      },
      [ClaimStatus.REJECTED]: {
        en: 'Rejected',
        fr: 'Rejeté',
        ar: 'مرفوض',
      },
      [ClaimStatus.CLOSED]: {
        en: 'Closed',
        fr: 'Clôturé',
        ar: 'مغلق',
      },
    };

    return statusLabels[this.status]?.[language] || this.status;
  }
}

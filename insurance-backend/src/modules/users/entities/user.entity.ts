import { Entity, Index, PrimaryGeneratedColumn, CreateDateColumn, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Log } from 'src/modules/logging/entities/log.entity';
import { Claim } from 'src/modules/claims/entities/claim.entity';
import { Contract } from 'src/integrations/erp/entities/contract.entity';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { StringColumn } from 'src/shared/decorators/portable-column.decorator';

export enum UserRole {
  USER = 'user',
  TENANT_ADMIN = 'tenant_admin',
}

@Entity('users')
@Index(['phone'], { unique: true, where: '"phone" IS NOT NULL' })
export class User extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @StringColumn(100)
  username: string;

  @StringColumn(255, { unique: true })
  email: string;

  // select: false keeps the hash out of every query unless it is asked for explicitly
  // (see UsersService.findCredentialsBy*), so it cannot leak through caches or relations.
  @StringColumn(255, { nullable: true, select: false })
  @Exclude()
  password?: string;

  // Uniqueness comes from the partial index on the class: a plain unique
  // constraint would allow only one user without a phone on SQL Server.
  @StringColumn(30, { nullable: true })
  phone?: string;

  @CreateDateColumn()
  createdAt: Date;

  @StringColumn(1000, { nullable: true })
  profilePictureUrl?: string;

  @StringColumn(30, { default: UserRole.USER })
  role: UserRole;

  @StringColumn(2, { default: 'en' })
  preferredLanguage: string; // Language preference: 'en', 'fr', 'ar'

  @OneToMany(() => Log, (log) => log.user)
  logs: Log[];

  @OneToMany(() => Claim, (claim) => claim.user)
  claims: Claim[];

  @OneToMany(() => Contract, (contract) => contract.user)
  contracts: Contract[];
}

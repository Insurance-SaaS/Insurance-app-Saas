import { Entity, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Claim } from './claim.entity';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { StringColumn } from 'src/shared/decorators/portable-column.decorator';

@Entity('experts')
export class Expert extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @StringColumn()
  fullName: string;

  @StringColumn()
  email: string;

  @StringColumn(255, { nullable: true })
  phoneNumber: string;

  @OneToMany(() => Claim, (claim) => claim.expert)
  claims: Claim[];
}

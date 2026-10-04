import { Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { DecimalColumn, StringColumn } from 'src/shared/decorators/portable-column.decorator';

export enum BranchType {
  AGA = 'AGA',
  AGD = 'AGD',
  AGP = 'AGP',
  ANNEXE = 'Annexe',
}

@Entity('branches')
export class Branch extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @StringColumn(50, { unique: true })
  code: string;

  @StringColumn(500)
  address: string;

  @StringColumn(20)
  type: BranchType;

  @DecimalColumn(10, 7, { nullable: true })
  latitude: number;

  @DecimalColumn(10, 7, { nullable: true })
  longitude: number;

  @StringColumn(50, { nullable: true })
  phoneNumber: string;
}


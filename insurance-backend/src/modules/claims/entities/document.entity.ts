import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Claim } from './claim.entity';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { StringColumn } from 'src/shared/decorators/portable-column.decorator';

@Entity('documents')
@Index(['claim'])
export class Document extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @StringColumn()
  fileName: string;

  @StringColumn(100, { nullable: true })
  contentType: string;

  @StringColumn(1000)
  fileUrl: string;

  @ManyToOne(() => Claim, (claim) => claim.documents, {
    onDelete: 'CASCADE',
  })
  claim: Claim;

  // Kept explicitly until all entities fully inherit timestamps from base entity
  @CreateDateColumn()
  createdAt: Date;
}

import { Entity, PrimaryGeneratedColumn, OneToOne, JoinColumn } from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { StringColumn } from 'src/shared/decorators/portable-column.decorator';

@Entity('mappings')
export class Mapping extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @StringColumn(255, { unique: true })
  externalAccountId: string;

  @OneToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;
}

import { User } from 'src/modules/users/entities/user.entity';
import { Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { InstantColumn, StringColumn } from 'src/shared/decorators/portable-column.decorator';

@Entity('logs')
export class Log extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @StringColumn()
  action: string;

  @ManyToOne(() => User, (user) => user.logs, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  user?: User;

  @StringColumn()
  email: string;

  @InstantColumn({ default: () => 'CURRENT_TIMESTAMP' })
  timestamp?: Date;

  @StringColumn(50, { default: '0ms' }) // actionDuration is stored as string with "ms" suffix (ex: "123.45ms")
  actionDuration: string;
}

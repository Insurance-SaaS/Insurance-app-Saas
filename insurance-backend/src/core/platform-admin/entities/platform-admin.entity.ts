import { CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { BooleanColumn, StringColumn } from 'src/shared/decorators/portable-column.decorator';

@Entity('platform_admins')
export class PlatformAdmin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @StringColumn(255, { unique: true })
  email: string;

  @StringColumn(120, { nullable: true })
  fullName?: string;

  @BooleanColumn({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

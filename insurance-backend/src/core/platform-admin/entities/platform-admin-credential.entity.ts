import { CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { StringColumn } from 'src/shared/decorators/portable-column.decorator';

@Entity('platform_admin_credentials')
export class PlatformAdminCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @StringColumn(36, { unique: true })
  platformAdminId: string;

  @StringColumn()
  passwordHash: string;

  @CreateDateColumn()
  createdAt: Date;
}

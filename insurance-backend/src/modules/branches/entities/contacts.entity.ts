import { Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { StringColumn } from 'src/shared/decorators/portable-column.decorator';

export enum ContactType {
  PHONE = 'phone',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  SKYPE = 'skype',
  VIBER = 'viber',
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  LINKEDIN = 'linkedin',
  FAX = 'fax',
  WEBSITE = 'website',
  ADDRESS = 'address',
  NIF = 'nif',
  RC = 'rc',
}

@Entity('contacts')
export class Contacts extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @StringColumn(20)
  type: ContactType;

  @StringColumn()
  value: string;
}

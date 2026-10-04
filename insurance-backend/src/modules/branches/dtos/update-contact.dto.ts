import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ContactType } from '../entities/contacts.entity';

export class UpdateContactDto {
  @ApiPropertyOptional({
    description: 'Type of contact',
    enum: ContactType,
    example: ContactType.PHONE,
  })
  @IsOptional()
  @IsEnum(ContactType, {
    message: 'Type must be one of: phone, email, whatsapp, telegram, skype, viber, instagram, facebook, linkedin',
  })
  type?: ContactType;

  @ApiPropertyOptional({
    description: 'Contact value (phone number, email, username, etc.)',
    example: '+213 555 12 34 56',
  })
  @IsOptional()
  @IsString()
  value?: string;
}


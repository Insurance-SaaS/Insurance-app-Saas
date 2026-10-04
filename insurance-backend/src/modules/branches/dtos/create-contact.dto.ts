import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ContactType } from '../entities/contacts.entity';

export class CreateContactDto {
  @ApiProperty({
    description: 'Type of contact',
    enum: ContactType,
    example: ContactType.PHONE,
  })
  @IsEnum(ContactType, {
    message: 'Type must be one of: phone, email, whatsapp, telegram, skype, viber, instagram, facebook, linkedin',
  })
  @IsNotEmpty({ message: 'Contact type is required' })
  type: ContactType;

  @ApiProperty({
    description: 'Contact value (phone number, email, username, etc.)',
    example: '+213 555 12 34 56',
  })
  @IsString()
  @IsNotEmpty({ message: 'Contact value is required' })
  value: string;
}


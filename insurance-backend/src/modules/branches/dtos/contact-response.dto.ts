import { ApiProperty } from '@nestjs/swagger';
import { ContactType } from '../entities/contacts.entity';

export class ContactResponseDto {
  @ApiProperty({
    description: 'Contact ID',
    example: '8b9014f1-f67a-43a7-991f-08ac2a2bb9f4',
  })
  id: string;

  @ApiProperty({
    description: 'Type of contact',
    enum: ContactType,
    example: ContactType.PHONE,
  })
  type: ContactType;

  @ApiProperty({
    description: 'Contact value',
    example: '+213 555 12 34 56',
  })
  value: string;
}

export class ContactListResponseDto {
  @ApiProperty({
    description: 'List of contacts',
    type: [ContactResponseDto],
  })
  data: ContactResponseDto[];

  @ApiProperty({
    description: 'Total number of contacts',
    example: 50,
  })
  total: number;
}


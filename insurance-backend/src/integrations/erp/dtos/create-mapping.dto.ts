import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMappingDto {
  @ApiProperty({
    description: 'The external account ID to be mapped',
    example: 'ACC-12345',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  externalAccountId: string;
}

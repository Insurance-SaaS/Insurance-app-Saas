import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMappingDto {
  @ApiProperty({
    description: 'The new user ID to be linked to the account',
    example: 'usr_xyz789abc',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  userId: string;
}

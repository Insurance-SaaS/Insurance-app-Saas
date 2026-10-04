import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RevertMigrationsDto {
  @ApiProperty({
    description: 'Name of the migration that should be the newest one left applied',
    example: 'TenantBaseline1759536000000',
  })
  @IsString()
  @Matches(/^[A-Za-z]\w*\d{13}$/, { message: 'toVersion must be a migration class name' })
  toVersion: string;
}

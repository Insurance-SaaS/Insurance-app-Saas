import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class PlatformAdminRefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDeviceTokenDto {
  @ApiProperty({
    description: 'FCM registration token from the mobile app',
    example: 'dGhpcyBpcyBhIGZha2UgdG9rZW4...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'Platform type',
    enum: ['ios', 'android', 'web'],
    example: 'android',
  })
  @IsString()
  @IsIn(['ios', 'android', 'web'])
  platform: 'ios' | 'android' | 'web';

  @ApiProperty({
    description: 'Optional device identifier',
    required: false,
    example: 'device-12345',
  })
  @IsString()
  @IsOptional()
  deviceId?: string;

  @ApiProperty({
    description: 'App version',
    required: false,
    example: '1.0.0',
  })
  @IsString()
  @IsOptional()
  appVersion?: string;
}


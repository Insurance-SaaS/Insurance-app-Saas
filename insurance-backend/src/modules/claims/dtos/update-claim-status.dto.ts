import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClaimStatus } from '../entities/claim.entity';

export class UpdateClaimStatusDto {
  @ApiProperty({
    description: 'New status for the sinister',
    enum: ClaimStatus,
    example: ClaimStatus.APPROVED,
  })
  @IsEnum(ClaimStatus)
  status: ClaimStatus;

  @ApiPropertyOptional({
    description: 'Expert ID to assign when status is IN_REVIEW',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('4')
  expertId?: string;
}


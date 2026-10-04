import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentStatus } from '../entities/payment-transaction.entity';

export class UpdatePaymentStatusDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @ApiPropertyOptional({ description: 'External gateway transaction ID' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  gatewayTransactionId?: string;
}

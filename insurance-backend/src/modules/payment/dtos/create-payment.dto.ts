import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '../entities/payment-transaction.entity';

export class CreatePaymentDto {
  @ApiPropertyOptional({ description: 'Quote / policy ID' })
  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @ApiPropertyOptional({ description: 'Claim ID (for deductible payments)' })
  @IsOptional()
  @IsUUID()
  claimId?: string;

  @ApiProperty({ description: 'Amount to pay' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ description: 'ISO-4217 currency code', default: 'DZD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional({
    description:
      'A value you choose (for example a UUID) and send again if you retry: the same key ' +
      'returns the payment created the first time instead of creating another one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'Description / memo' })
  @IsOptional()
  @IsString()
  description?: string;
}

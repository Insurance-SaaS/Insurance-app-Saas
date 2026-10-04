import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateQuoteDto {
  @ApiProperty({ description: 'Title (English)' })
  @IsString()
  @IsNotEmpty()
  titleEn: string;

  @ApiProperty({ description: 'Title (French)' })
  @IsString()
  @IsNotEmpty()
  titleFr: string;

  @ApiProperty({ description: 'Title (Arabic)' })
  @IsString()
  @IsNotEmpty()
  titleAr: string;

  @ApiProperty({ description: 'Monthly premium price' })
  @IsNumber()
  @IsPositive()
  priceMonthly: number;

  @ApiProperty({ description: 'Deductible amount' })
  @IsNumber()
  @Min(0)
  deductible: number;

  @ApiProperty({ description: 'Term in months' })
  @IsNumber()
  @IsPositive()
  termMonths: number;

  @ApiProperty({ description: 'Plan type (English)' })
  @IsString()
  @IsNotEmpty()
  planTypeEn: string;

  @ApiProperty({ description: 'Plan type (French)' })
  @IsString()
  @IsNotEmpty()
  planTypeFr: string;

  @ApiProperty({ description: 'Plan type (Arabic)' })
  @IsString()
  @IsNotEmpty()
  planTypeAr: string;

  @ApiProperty({ description: 'Start condition (English)' })
  @IsString()
  @IsNotEmpty()
  startConditionEn: string;

  @ApiProperty({ description: 'Start condition (French)' })
  @IsString()
  @IsNotEmpty()
  startConditionFr: string;

  @ApiProperty({ description: 'Start condition (Arabic)' })
  @IsString()
  @IsNotEmpty()
  startConditionAr: string;

  @ApiProperty({ description: 'Product ID to link this quote to' })
  @IsUUID()
  productId: string;

}

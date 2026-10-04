import { ApiProperty } from '@nestjs/swagger';

export class RecommendedQuoteDto {
  @ApiProperty({ example: '5f67c9f2-3a8e-4c9b-9f52-7f9f8f2c7a2b' })
  id: string;

  @ApiProperty({ example: 'Assurance Auto Premium' })
  title: string;

  @ApiProperty({ example: 5800, description: 'Monthly price of the quote' })
  priceMonthly: number;

  @ApiProperty({ example: 2000, description: 'Deductible (franchise)' })
  deductible: number;

  @ApiProperty({ example: 12, description: 'Contract duration in months' })
  termMonths: number;
}

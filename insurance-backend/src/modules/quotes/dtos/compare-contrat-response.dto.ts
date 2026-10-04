// src/modules/quotes/dtos/compare-devis-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

class QuoteComparisonPlanDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() priceMonthly: number;
  @ApiProperty() deductible: number;
  @ApiProperty() coverage: string;
  @ApiProperty() thirdPartyCoverage: string;
}

export class CompareQuotesResponseDto {
  @ApiProperty({ type: QuoteComparisonPlanDto })
  planA: QuoteComparisonPlanDto;

  @ApiProperty({ type: QuoteComparisonPlanDto })
  planB: QuoteComparisonPlanDto;
}

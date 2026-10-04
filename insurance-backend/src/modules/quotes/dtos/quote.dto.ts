import { ApiProperty } from '@nestjs/swagger';

export class PlanOverviewDto {
  @ApiProperty({ example: 'Premium Plan' })
  planType: string;

  @ApiProperty({ example: 5800 })
  priceMonthly: number;

  @ApiProperty({ example: 40000 })
  deductible: number;

  @ApiProperty({ example: 12 })
  termMonths: number;

  @ApiProperty({
    example: 'Starts after acceptance of the insurance policy',
    required: false,
  })
  startCondition?: string;
}

export class PaymentDto {
  @ApiProperty({ example: 'monthly' })
  type: string;

  @ApiProperty({ example: 5800 })
  amount: number;

  @ApiProperty({ example: 'credit card' })
  mode: string;
}

export class CoverageDetailDto {
  @ApiProperty({ example: 'Collision coverage' })
  label: string;

  @ApiProperty({ example: true })
  included: boolean;
}

export class SummaryTermsDto {
  @ApiProperty({ example: 'Contract valid for 12 months after activation' })
  contractValidity: string;

  @ApiProperty({ example: 'Cancelable anytime with 30 days notice' })
  cancelPolicy: string;

  @ApiProperty({ example: 'Claims processed within 5–7 business days' })
  claimsProcessing: string;

  @ApiProperty({ example: 'All documents securely stored in your account' })
  docsStorage: string;
}

export class QuoteDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: () => PlanOverviewDto })
  planOverview: PlanOverviewDto;

  @ApiProperty({ type: () => [PaymentDto] })
  payments: PaymentDto[];

  @ApiProperty({ type: () => [CoverageDetailDto] })
  coverageDetails: CoverageDetailDto[];

  @ApiProperty({ type: () => SummaryTermsDto })
  summaryTerms?: SummaryTermsDto | null;

}

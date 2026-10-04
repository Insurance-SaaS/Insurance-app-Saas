// recommended-devis-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { RecommendedQuoteDto } from './recommended-quotes.dto';

export class RecommendedQuoteResponseDto {
  @ApiProperty({
    example: 3,
    description: 'Total number of recommended quotes',
  })
  total: number;

  @ApiProperty({
    type: [RecommendedQuoteDto],
    description:
      'List of recommended quotes sorted from most relevant to least relevant',
  })
  data: RecommendedQuoteDto[];
}

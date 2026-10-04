import { ApiProperty } from '@nestjs/swagger';
import { ClaimSummaryDto } from './claim-summary.dto';

export class MyClaimsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    type: [ClaimSummaryDto],
    description: 'List of user claims with basic information including creation date',
  })
  data: ClaimSummaryDto[];

  @ApiProperty({
    example: 5,
    description: 'Total number of claims of the user, across all pages',
  })
  total: number;

  @ApiProperty({ example: 1, description: 'Page returned' })
  page: number;

  @ApiProperty({ example: 50, description: 'Page size used' })
  limit: number;
}

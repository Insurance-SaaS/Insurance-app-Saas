// src/modules/quotes/dtos/compare-devis.dto.ts
import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompareQuotesDto {
  @ApiProperty({
    description: 'ID of the first devis to compare',
    example: '20000000-0000-0000-0000-000000000001',
  })
  @IsUUID()
  devisAId: string;

  @ApiProperty({
    description: 'ID of the second devis to compare',
    example: '20000000-0000-0000-0000-000000000003',
  })
  @IsUUID()
  devisBId: string;
}

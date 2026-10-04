import { ApiProperty } from '@nestjs/swagger';

export class ContractSummaryDto {
  @ApiProperty({ example: 'a8db1f87-1c3d-4e9f-a144-8efcc12567ef' })
  id: string;

  @ApiProperty({ example: "Contrat d'Auto" })
  title: string;
}

export class ContractDetailsDto {
  @ApiProperty({ example: 'a8db1f87-1c3d-4e9f-a144-8efcc12567ef' })
  id: string;

  @ApiProperty({ example: "Contrat d'Automobile pentuim" })
  title: string;

  @ApiProperty({ example: "Contrat d'Auto mobile" })
  type: string;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ example: '2025-10-03' })
  startDate: string;

  @ApiProperty({ example: '2026-10-03' })
  endDate: string;

  @ApiProperty({
    example: {
      id: 'd1',
      type: 'Auto',
      title: 'Car insurance full coverage',
    },
  })
  devis: {
    id: string;
    type: string;
    title: string;
  };

  @ApiProperty({ example: 'ACC-12345', nullable: true })
  externalAccountId: string | null;
}

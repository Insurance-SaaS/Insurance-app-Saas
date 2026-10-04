// src/contracts/dto/create-contract.dto.ts
import { IsUUID, IsDateString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContractDto {
  @ApiProperty({
    description: 'The UUID of the devis associated with the contract',
    example: '30179692-c845-4883-80af-fa24057b8237',
  })
  @IsUUID()
  devisId: string;

  @ApiProperty({
    description: 'The start date of the contract (ISO format)',
    example: '2025-10-05',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'The end date of the contract (ISO format)',
    example: '2026-10-05',
  })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Tenant-defined custom fields payload',
  })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}

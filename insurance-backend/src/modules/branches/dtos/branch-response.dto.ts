import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BranchType } from '../entities/branch.entity';

export class BranchResponseDto {
  @ApiProperty({
    description: 'Branch ID',
    example: '8b9014f1-f67a-43a7-991f-08ac2a2bb9f4',
  })
  id: string;

  @ApiProperty({
    description: 'Unique branch code',
    example: '5087',
  })
  code: string;

  @ApiProperty({
    description: 'Full address of the branch',
    example: '24, allée des frères Menasria, cité Annasr',
  })
  address: string;

  @ApiProperty({
    description: 'Type of branch',
    enum: BranchType,
    example: BranchType.AGA,
  })
  type: BranchType;

  @ApiPropertyOptional({
    description: 'Latitude coordinate for map display',
    example: 35.55301,
  })
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude coordinate for map display',
    example: 6.1703,
  })
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Phone number of the branch',
    example: '+213 23 45 67 89',
  })
  phoneNumber?: string;
}

export class BranchListResponseDto {
  @ApiProperty({
    description: 'List of branches',
    type: [BranchResponseDto],
  })
  data: BranchResponseDto[];

  @ApiProperty({
    description: 'Total number of branches',
    example: 342,
  })
  total: number;
}

export class MapBranchDto {
  @ApiProperty({ example: '8b9014f1-f67a-43a7-991f-08ac2a2bb9f4' })
  id: string;

  @ApiProperty({ example: '5087' })
  code: string;

  @ApiProperty({ example: '24, allée des frères Menasria, cité Annasr' })
  address: string;

  @ApiProperty({ enum: BranchType, example: BranchType.AGA })
  type: BranchType;

  @ApiProperty({ example: 35.55301 })
  latitude: number;

  @ApiProperty({ example: 6.1703 })
  longitude: number;

  @ApiPropertyOptional({ example: '+213 23 45 67 89' })
  phoneNumber?: string;
}


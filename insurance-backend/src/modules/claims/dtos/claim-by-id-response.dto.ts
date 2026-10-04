import { ApiProperty } from '@nestjs/swagger';
import { ClaimResponseDto } from './claim-response.dto';

export class ClaimByIdResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    type: () => ClaimResponseDto,
    description: 'Complete sinister details including createdAt timestamp',
  })
  data: ClaimResponseDto;
}

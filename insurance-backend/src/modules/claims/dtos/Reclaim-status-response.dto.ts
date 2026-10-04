import { ApiProperty } from '@nestjs/swagger';
import { ClaimResponseDto } from './claim-response.dto';

export class ReclamationStatusResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: () => ClaimResponseDto })
  data: ClaimResponseDto;
}

import { ApiProperty } from '@nestjs/swagger';
import { ClaimResponseDto } from './claim-response.dto';

export class DeclareClaimResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    example: 'Votre réclamation a été déposée ! Numéro de référence: #CLM12345678',
    description: 'Success message with claim reference number',
  })
  message: string;

  @ApiProperty({
    type: () => ClaimResponseDto,
    description: 'Complete sinister details including createdAt timestamp',
  })
  data: ClaimResponseDto;
}

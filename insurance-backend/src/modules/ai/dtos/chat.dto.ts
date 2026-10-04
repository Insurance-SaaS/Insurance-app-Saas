import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Longest message accepted. Longer input is almost always pasted noise, and costs tokens. */
export const MAX_MESSAGE_LENGTH = 4000;

export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export class ChatRequestDto {
  @ApiProperty({
    description: 'The message to send to the assistant (French, English or Arabic)',
    example: "Bonjour, j'ai eu un accident de voiture",
    maxLength: MAX_MESSAGE_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MESSAGE_LENGTH)
  message: string;

  @ApiPropertyOptional({
    description:
      'Id of the conversation to continue, as returned by a previous answer. ' +
      'Leave it out to start a new conversation; the server issues the id.',
  })
  @IsOptional()
  @Matches(SESSION_ID_PATTERN, { message: 'sessionId is not a valid session id' })
  sessionId?: string;
}

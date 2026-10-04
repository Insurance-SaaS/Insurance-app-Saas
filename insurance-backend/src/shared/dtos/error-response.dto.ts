import { ApiProperty } from '@nestjs/swagger';

/**
 * Standard error response structure for API documentation
 */
export class ErrorResponseDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Error message',
    example: 'Validation failed',
  })
  message: string | string[];

  @ApiProperty({
    description: 'Error code for programmatic error handling',
    example: 'VALIDATION_ERROR',
    required: false,
  })
  code?: string;

  @ApiProperty({
    description: 'Additional error details',
    required: false,
  })
  details?: any;

  @ApiProperty({
    description: 'Request path',
    example: '/api/sinisters/declare',
    required: false,
  })
  path?: string;

  @ApiProperty({
    description: 'HTTP method',
    example: 'POST',
    required: false,
  })
  method?: string;

  @ApiProperty({
    description: 'Request ID for tracking',
    example: 'req-123456',
    required: false,
  })
  requestId?: string;

  @ApiProperty({
    description: 'Timestamp of the error',
    example: '2024-01-01T00:00:00.000Z',
    required: false,
  })
  timestamp?: string;
}

/**
 * Validation error response
 */
export class ValidationErrorResponseDto extends ErrorResponseDto {
  @ApiProperty({
    description: 'Validation errors',
    example: [
      {
        field: 'email',
        message: 'email must be an email',
      },
    ],
    required: false,
  })
  validationErrors?: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Not found error response
 */
export class NotFoundErrorResponseDto extends ErrorResponseDto {
  @ApiProperty({
    description: 'Error code',
    example: 'RESOURCE_NOT_FOUND',
  })
  declare code: string;

  @ApiProperty({
    description: 'Resource type that was not found',
    example: 'Claim',
    required: false,
  })
  resource?: string;

  @ApiProperty({
    description: 'Identifier used to search for the resource',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  identifier?: string;
}

/**
 * Conflict error response
 */
export class ConflictErrorResponseDto extends ErrorResponseDto {
  @ApiProperty({
    description: 'Error code',
    example: 'CONFLICT',
  })
  declare code: string;

  @ApiProperty({
    description: 'Field that caused the conflict',
    example: 'email',
    required: false,
  })
  conflictField?: string;
}

/**
 * Internal server error response
 */
export class InternalServerErrorResponseDto extends ErrorResponseDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 500,
  })
  declare statusCode: number;

  @ApiProperty({
    description: 'Error message',
    example: 'Internal server error',
  })
  declare message: string;
}


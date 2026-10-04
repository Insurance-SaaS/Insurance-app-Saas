import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base class for business logic exceptions
 * These are expected errors that should be handled gracefully
 */
export class BusinessException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly code?: string,
    public readonly details?: any,
  ) {
    super(
      {
        message,
        code,
        details,
        statusCode,
      },
      statusCode,
    );
  }
}

/**
 * Exception for resource not found errors
 */
export class NotFoundException extends BusinessException {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', { resource, identifier });
  }
}

/**
 * Exception for validation errors
 */
export class ValidationException extends BusinessException {
  constructor(message: string, public readonly validationErrors?: any[]) {
    super(
      message,
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      { validationErrors },
    );
  }
}

/**
 * Exception for unauthorized access
 */
export class UnauthorizedException extends BusinessException {
  constructor(message: string = 'Unauthorized access') {
    super(message, HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED');
  }
}

/**
 * Exception for forbidden access
 */
export class ForbiddenException extends BusinessException {
  constructor(message: string = 'Forbidden: Insufficient permissions') {
    super(message, HttpStatus.FORBIDDEN, 'FORBIDDEN');
  }
}

/**
 * Exception for conflict errors (e.g., duplicate resources)
 */
export class ConflictException extends BusinessException {
  constructor(message: string, public readonly conflictField?: string) {
    super(message, HttpStatus.CONFLICT, 'CONFLICT', { conflictField });
  }
}

/**
 * Exception for database errors
 */
export class DatabaseException extends BusinessException {
  constructor(message: string, public readonly originalError?: any) {
    super(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'DATABASE_ERROR',
      { originalError: originalError?.message },
    );
  }
}

/**
 * Exception for external service errors
 */
export class ExternalServiceException extends BusinessException {
  constructor(
    service: string,
    message: string,
    public readonly originalError?: any,
  ) {
    super(
      `External service error (${service}): ${message}`,
      HttpStatus.SERVICE_UNAVAILABLE,
      'EXTERNAL_SERVICE_ERROR',
      { service, originalError: originalError?.message },
    );
  }
}


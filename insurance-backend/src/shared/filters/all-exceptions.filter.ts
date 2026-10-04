import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AppLogger } from '../logger/app-logger.service';
import { BusinessException } from '../exceptions/business.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly appLogger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();

    const requestId = req?.requestId;
    const method = req?.method;
    const url = req?.originalUrl || req?.url;

    const { status, responseBody, errorCode, errorDetails } = this.describe(exception);
    if (!(exception instanceof HttpException) && exception instanceof Error) {
      this.logger.error(
        `Unexpected error on ${method} ${url}`,
        exception.stack,
        'AllExceptionsFilter',
      );
    }

    // Enhanced logging
    const logContext = {
      requestId,
      status,
      method,
      url,
      errorCode,
      userId: req?.user?.id,
      ip: req?.ip || req?.socket?.remoteAddress,
    };

    if (status >= 500) {
      // Log server errors with full details
      this.appLogger.error(
        `Server error on ${method} ${url}`,
        exception instanceof Error ? exception.stack : undefined,
        'Exceptions',
        logContext,
      );
    } else if (status >= 400) {
      // Log client errors with less detail
      this.appLogger.warn(
        `Client error on ${method} ${url}: ${responseBody.message || 'Bad request'}`,
        'Exceptions',
        logContext,
      );
    }

    // Build standardized error response
    const payload: any = {
      statusCode: status,
      message: responseBody.message || responseBody.error || 'An error occurred',
      path: url,
      method,
      timestamp: new Date().toISOString(),
    };

    // Add optional fields
    if (requestId) {
      payload.requestId = requestId;
    }
    if (errorCode) {
      payload.code = errorCode;
    }
    if (errorDetails) {
      payload.details = errorDetails;
    }

    // Include validation errors if present
    if (responseBody.message && Array.isArray(responseBody.message)) {
      payload.message = responseBody.message;
    }

    // Don't expose internal error details in production
    if (process.env.NODE_ENV === 'production' && status >= 500) {
      payload.message = 'An unexpected error occurred. Please try again later.';
      delete payload.details;
    }

    // Fastify reply
    res.code(status).send(payload);
  }

  /** Status, body and error code for an exception of any kind. */
  private describe(exception: unknown): {
    status: number;
    responseBody: any;
    errorCode?: string;
    errorDetails?: unknown;
  } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const business = exception instanceof BusinessException ? exception : undefined;
      const isObject = Boolean(response) && typeof response === 'object';
      return {
        status: exception.getStatus(),
        responseBody: isObject ? response : { message: response },
        // A business exception carries a code for clients and optional details.
        errorCode: isObject ? business?.code : undefined,
        errorDetails: isObject ? business?.details : undefined,
      };
    }

    const unexpected = exception instanceof Error ? exception.message : undefined;
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      responseBody: {
        message:
          process.env.NODE_ENV === 'production' || !unexpected
            ? 'An unexpected error occurred. Please try again later.'
            : unexpected,
      },
      errorCode: exception instanceof Error ? 'INTERNAL_SERVER_ERROR' : undefined,
    };
  }
}

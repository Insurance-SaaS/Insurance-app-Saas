import { Injectable, Logger, LoggerService, Scope } from '@nestjs/common';

/**
 * Application logger: one line per event, with optional structured details
 * appended as JSON. Printing goes through Nest's logger, so LOG_LEVEL applies.
 */
@Injectable({ scope: Scope.DEFAULT })
export class AppLogger implements LoggerService {
  private static readonly DEFAULT_CONTEXT = 'App';

  private format(message: any, meta?: Record<string, any>): string {
    try {
      return meta ? `${message} ${JSON.stringify(meta)}` : `${message}`;
    } catch {
      return `${message}`;
    }
  }

  log(message: any, context?: string, meta?: Record<string, any>) {
    Logger.log(this.format(message, meta), context ?? AppLogger.DEFAULT_CONTEXT);
  }

  error(message: any, trace?: string, context?: string, meta?: Record<string, any>) {
    const full = trace ? `${message} | ${trace}` : message;
    Logger.error(this.format(full, meta), context ?? AppLogger.DEFAULT_CONTEXT);
  }

  warn(message: any, context?: string, meta?: Record<string, any>) {
    Logger.warn(this.format(message, meta), context ?? AppLogger.DEFAULT_CONTEXT);
  }

  debug(message: any, context?: string, meta?: Record<string, any>) {
    Logger.debug(this.format(message, meta), context ?? AppLogger.DEFAULT_CONTEXT);
  }

  verbose(message: any, context?: string, meta?: Record<string, any>) {
    Logger.verbose(this.format(message, meta), context ?? AppLogger.DEFAULT_CONTEXT);
  }
}

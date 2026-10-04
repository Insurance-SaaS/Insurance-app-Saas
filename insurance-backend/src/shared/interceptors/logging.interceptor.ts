import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AppLogger } from '../logger/app-logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    const ctx = context.switchToHttp();
    const req = ctx.getRequest();
    const method = req?.method;
    const url = req?.originalUrl || req?.url;
    const requestId = req?.requestId;

    this.logger.log(`Incoming ${method} ${url}`, 'HTTP', { requestId });

    return next.handle().pipe(
      tap({
        next: () => {
          const res = ctx.getResponse();
          const statusCode = res?.statusCode;
          const durationMs = Date.now() - now;
          this.logger.log(`Completed ${method} ${url} ${statusCode} in ${durationMs}ms`, 'HTTP', {
            requestId,
            statusCode,
            durationMs,
          });
        },
        error: (err) => {
          const durationMs = Date.now() - now;
          this.logger.error(`Error on ${method} ${url} in ${durationMs}ms`, err?.stack, 'HTTP', {
            requestId,
            durationMs,
          });
        },
      }),
    );
  }
}

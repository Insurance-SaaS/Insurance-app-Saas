import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/** Works with both Fastify (app.use via middie passes Express-like req/res) and Nest route middleware (FastifyRequest/FastifyReply). */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: (err?: Error) => void): void {
    const headerName = 'x-request-id';
    const existing = req.headers?.[headerName] as string | undefined;
    const requestId = existing && existing.length > 0 ? existing : randomUUID();
    req.requestId = requestId;
    if (typeof res?.header === 'function') {
      res.header(headerName, requestId);
    } else if (typeof res?.setHeader === 'function') {
      res.setHeader(headerName, requestId);
    }
    next();
  }
}

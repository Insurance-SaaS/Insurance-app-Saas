import { NestFactory, Reflector } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppLogger } from './shared/logger/app-logger.service';
import { logLevels } from './shared/logger/log-levels';
import { RequestIdMiddleware } from './shared/middleware/request-id.middleware';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';
import { checkReadiness } from './shared/health/readiness';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';

/**
 * TRUST_PROXY tells Fastify how many reverse proxies sit in front of the app
 * (or `true` to trust all), so request.ip is the client address. Rate limiting
 * keys on that address; without it every client shares the proxy's address.
 */
function trustedProxyHops(): number {
  const hops = Number((process.env.TRUST_PROXY ?? '').trim());
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}

export function createFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    logger: process.env.NODE_ENV === 'development',
    // Applies to JSON and other buffered bodies. File uploads are multipart and
    // are bounded by the multipart limits below, not by this value.
    bodyLimit: Number.parseInt(process.env.BODY_LIMIT_BYTES || String(1024 * 1024), 10),
    // A number of hops, or every proxy when TRUST_PROXY=true.
    trustProxy:
      (process.env.TRUST_PROXY ?? '').trim().toLowerCase() === 'true' || trustedProxyHops() || false,
  });
}

/** Browser origins allowed to call the API. Mobile apps are not subject to CORS. */
function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Applies everything that makes a Nest application behave like the real API:
 * prefix, pipes, interceptors, filters, CORS, multipart, Swagger and health.
 * Shared by main.ts and the integration tests so both run the same pipeline.
 */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  const appLogger = new AppLogger();

  // API versioning — all routes are prefixed with /api/v1
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/ready'],
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global serializer
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new LoggingInterceptor(appLogger),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter(appLogger));

  // Request ID middleware
  app.use(new RequestIdMiddleware().use);

  // Security headers. The Swagger UI (non-production only) needs inline scripts.
  await app.register(require('@fastify/helmet'), {
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  });

  // CORS with additional headers for large file uploads
  app.enableCors({
    // No list configured: closed in production, open while developing.
    origin: corsOrigins().length > 0 ? corsOrigins() : process.env.NODE_ENV !== 'production',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-ID',
      'X-API-Key',
      'ngrok-skip-browser-warning',
      'Accept',
      'Origin',
      'User-Agent',
      'Cache-Control',
      // Additional headers for multipart uploads
      'Content-Length',
      'Content-Disposition',
    ],
    credentials: true,
    // Increase preflight cache for large uploads
    maxAge: 86400, // 24 hours
  });

  // Enhanced multipart configuration for large file uploads
  await app.register(require('@fastify/multipart'), {
    limits: {
      fieldNameSize: 100, // Field name size limit
      fieldSize: 1024 * 1024, // Field value size limit (1MB)
      fields: 30, // Maximum number of non-file fields
      fileSize: 50 * 1024 * 1024, // 50MB per file
      files: 10, // Maximum 10 files
      headerPairs: 2000, // Maximum number of header key-value pairs
      parts: 40, // Maximum number of parts (fields + files)
    },
    // Enhanced error handling for large files
    throwFileSizeLimit: true,
    attachFieldsToBody: false,
    // Custom error messages for security issues
    onProtoPoisonError: (error, req, reply) => {
      appLogger.error('Prototype pollution attempt detected:', error?.stack, 'Multipart', {
        requestId: req?.requestId,
      });
      reply.code(400).send({
        error: 'Invalid request format',
        message: 'Request contains invalid data structure',
      });
    },
    onConstructorPoisonError: (error, req, reply) => {
      appLogger.error('Constructor pollution attempt detected:', error?.stack, 'Multipart', {
        requestId: req?.requestId,
      });
      reply.code(400).send({
        error: 'Invalid request format',
        message: 'Request contains invalid data structure',
      });
    },
  });

  // Swagger (only non-production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Insurance Platform API')
      .setDescription(
        `
          Insurance Platform API Documentation

          ## Authentication
          Use Bearer token authentication for protected endpoints.

          ## File Uploads
          - **Maximum files per request**: 10 files
          - **Maximum file size**: 50MB per file
          - **Total upload limit**: 500MB per request
          - **Supported file types**: Images (JPG, PNG, GIF, WebP), Documents (PDF, DOC, DOCX)
          - **Timeout**: Large uploads may take several minutes

          ## Upload Guidelines
          - Use \`multipart/form-data\` content type
          - Ensure stable internet connection for large files
          - Files are stored securely in MinIO object storage
          - Progress tracking available for mobile apps
        `,
      )
      .setVersion('1.0.0')
      .addServer(`http://localhost:${process.env.PORT || 3000}/api/v1`, 'Development server')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('api', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
        showRequestHeaders: true,
        // Better support for file uploads in Swagger UI
        supportedSubmitMethods: ['get', 'post', 'put', 'patch', 'delete'],
        requestTimeout: 300000, // 5 minutes timeout for large uploads
      },
      customSiteTitle: 'Insurance Platform API Documentation',
      customCss: `
          .swagger-ui .topbar { display: none }
          .swagger-ui .scheme-container { background: #f7f7f7; padding: 10px; }
          .swagger-ui .info .title { color: #2d5aa0; }
        `,
    });
  }

  // Liveness: the process is up. Deliberately says nothing about the runtime or its memory.
  app.getHttpAdapter().get('/health', (request, reply) => {
    reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Readiness: the process can serve requests. This is the check a load
  // balancer should use to decide whether to send traffic here.
  app.getHttpAdapter().get('/health/ready', (request, reply) => {
    void checkReadiness(app).then((readiness) => {
      reply.code(readiness.status === 'ok' ? 200 : 503).send(readiness);
    });
  });
}

/** Builds the fully configured application without starting to listen. */
export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(), {
    logger: logLevels(),
  });
  await configureApp(app);
  // Run onModuleDestroy hooks (database pools, Redis) on SIGTERM/SIGINT.
  app.enableShutdownHooks();
  return app;
}

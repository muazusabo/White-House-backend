import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, static as expressStatic } from 'express';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { StructuredLogger } from './common/structured-logger';

async function bootstrap() {
  const logger = new StructuredLogger();
  let sentry: {
    captureException: (error: unknown) => void;
    init?: (options: { dsn: string; environment: string }) => void;
  } | null = null;
  if (process.env.SENTRY_DSN) {
    try {
      sentry = require('@sentry/node');
      sentry?.init?.({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
      });
    } catch {
      logger.warn('SENTRY_DSN is set but @sentry/node is not installed; using structured logs.', 'Monitoring');
    }
  }

  process.on('uncaughtException', (error) => {
    logger.error(error.message, error.stack, 'Process');
    sentry?.captureException(error);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(String(reason), undefined, 'Process');
    sentry?.captureException(reason);
  });

  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.useLogger(logger);

  app.use(json({ limit: '3mb' }));
  app.use(helmet());
  app.use((request, response, next) => {
    const startedAt = Date.now();
    response.on('finish', () => {
      logger.log(JSON.stringify({
        event: 'http_request',
        method: request.method,
        path: request.originalUrl,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
      }), 'HTTP');
    });
    next();
  });
  app.use('/uploads', expressStatic(join(process.cwd(), 'uploads')));

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.CLIENT_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin || allowedOrigins.includes(requestOrigin.replace(/\/$/, ''))) {
        callback(null, true);
        return;
      }
      logger.warn(`Rejected CORS origin: ${requestOrigin}`, 'CORS');
      callback(new Error('Origin is not allowed by CORS'), false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`White House Eatry API running on http://localhost:${port}/api`);
}
bootstrap();

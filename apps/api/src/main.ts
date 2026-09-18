import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('HTTP');
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');

  app.setGlobalPrefix('api');

  const origins = (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: true,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId =
      String(req.headers['x-request-id'] ?? '').trim() || randomUUID();
    const started = Date.now();
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'same-origin');
    res.setHeader(
      'permissions-policy',
      'camera=(), microphone=(), geolocation=()',
    );
    res.on('finish', () => {
      logger.log(
        JSON.stringify({
          requestId,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          durationMs: Date.now() - started,
        }),
      );
    });
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(Number(process.env.PORT ?? 4001), '127.0.0.1');
}

await bootstrap();

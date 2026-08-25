import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string | string[];
}

// Plain `number`, not `HttpStatus`, so the `status >= INTERNAL_SERVER_ERROR_CODE` check below
// compares two numbers rather than tripping @typescript-eslint/no-unsafe-enum-comparison.
const INTERNAL_SERVER_ERROR_CODE: number = HttpStatus.INTERNAL_SERVER_ERROR;

function extractMessage(response: string | object): string | string[] {
  if (typeof response === 'string') return response;
  const body = response as { message?: string | string[] };
  return body.message ?? 'Unexpected error';
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status: number = isHttpException
      ? exception.getStatus()
      : INTERNAL_SERVER_ERROR_CODE;
    const message = isHttpException
      ? extractMessage(exception.getResponse())
      : 'Internal server error';

    if (status >= INTERNAL_SERVER_ERROR_CODE) {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
      // A no-op when SENTRY_DSN isn't configured (docs/ROADMAP.md FDP-22) — Sentry.init() is
      // never called in that case (see main.ts), and captureException on an uninitialized SDK
      // is a documented safe no-op, not an error.
      Sentry.captureException(exception);
    }

    const body: ErrorBody = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    };

    response.status(status).json(body);
  }
}

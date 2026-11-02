import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { AppError } from '../errors/app-error';

export interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  requestId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const requestId = request.id === undefined ? undefined : String(request.id);

    const body = this.toBody(exception, requestId);
    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: exception }, 'Unhandled error');
    }
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, requestId?: string): ErrorBody {
    if (exception instanceof AppError) {
      return {
        statusCode: exception.status,
        error: exception.code,
        message: exception.message,
        requestId,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        statusCode: status,
        error: HttpStatus[status] ?? 'ERROR',
        message: this.httpMessage(exception),
        requestId,
      };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      requestId,
    };
  }

  private httpMessage(exception: HttpException): string {
    const res = exception.getResponse();
    if (typeof res === 'string') return res;
    const message = (res as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join('; ');
    return typeof message === 'string' ? message : exception.message;
  }
}

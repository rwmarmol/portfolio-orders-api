import { HttpStatus } from '@nestjs/common';

/** Base class for expected, client-safe errors raised by services. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = HttpStatus.BAD_REQUEST,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(code, message, HttpStatus.BAD_REQUEST);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super('NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(code, message, HttpStatus.CONFLICT);
  }
}

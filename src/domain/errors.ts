/** Base class for errors raised by domain functions. Services translate them to HTTP errors. */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The order request itself is invalid (maps to HTTP 400, the order is not stored). */
export class InvalidOrderInputError extends DomainError {}

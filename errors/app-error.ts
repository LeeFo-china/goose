// src/errors/app-error.ts
export class AppError extends Error {
  public readonly isOperational = true;

  constructor(
    public statusCode: number,
    public override message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}

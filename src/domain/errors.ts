import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
export function failure(error: unknown) {
  if (error instanceof AppError)
    return {
      ok: false as const,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
  if (error instanceof ZodError)
    return {
      ok: false as const,
      error: {
        code: "INVALID_INPUT",
        message: "Input does not match the operation contract.",
        details: error.issues,
      },
    };
  const e = error as NodeJS.ErrnoException;
  return {
    ok: false as const,
    error: {
      code: e.code ?? "INTERNAL_ERROR",
      message: e.message ?? String(error),
    },
  };
}
export function requireCondition(
  value: unknown,
  code: string,
  message: string,
): asserts value {
  if (!value) throw new AppError(code, message);
}

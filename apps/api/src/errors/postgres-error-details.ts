type ErrorDetails = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

function asErrorDetails(value: unknown): ErrorDetails | null {
  return value !== null && typeof value === "object"
    ? value as ErrorDetails
    : null;
}

export function matchesPostgresError(
  error: unknown,
  code: string,
  message: string,
) {
  const direct = asErrorDetails(error);
  if (direct?.code === code && direct.message === message) return true;

  const wrapped = asErrorDetails(direct?.details);
  return wrapped?.code === code && wrapped.message === message;
}

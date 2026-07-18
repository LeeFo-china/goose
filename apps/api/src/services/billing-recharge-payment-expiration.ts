const RFC3339_DATE_TIME_PATTERN =
  /^(\d{4})-(0[1-9]|1[0-2])-([0-2]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export function parseBillingRechargePaymentExpiration(
  value: string | null | undefined,
) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const match = RFC3339_DATE_TIME_PATTERN.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(0);
  calendarDate.setUTCHours(0, 0, 0, 0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }

  const expiresAtMs = Date.parse(trimmed);
  return Number.isFinite(expiresAtMs)
    ? { value: trimmed, expiresAtMs }
    : null;
}

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

export function isBillingRechargePaymentWindowOpen(
  order: {
    status: string;
    channel: string;
    payment_expires_at?: string | null;
  },
  now: Date,
): boolean {
  const expiration = parseBillingRechargePaymentExpiration(
    order.payment_expires_at,
  );
  return order.status === "pending" &&
    order.channel === "wechat_pay" &&
    Boolean(expiration && expiration.expiresAtMs > now.getTime());
}

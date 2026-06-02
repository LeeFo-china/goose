import type { DateRange, UsageDateRangeQuery } from "./shared";

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function dateOnlyToUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function normalizeDateRange(input: UsageDateRangeQuery): DateRange {
  const fromDate = input.date_from
    ? dateOnlyToUtc(input.date_from)
    : startOfCurrentMonth();
  const toDate = input.date_to
    ? dateOnlyToUtc(input.date_to)
    : new Date();

  const normalizedFrom = toDateOnly(fromDate);
  const normalizedTo = toDateOnly(toDate);
  const createdFrom = dateOnlyToUtc(normalizedFrom).toISOString();
  const createdTo = addDays(dateOnlyToUtc(normalizedTo), 1).toISOString();

  return {
    dateFrom: normalizedFrom,
    dateTo: normalizedTo,
    createdFrom,
    createdTo,
  };
}

export function buildDateBuckets(range: DateRange) {
  const buckets: string[] = [];
  let cursor = dateOnlyToUtc(range.dateFrom);
  const end = dateOnlyToUtc(range.dateTo);

  while (cursor.getTime() <= end.getTime()) {
    buckets.push(toDateOnly(cursor));
    cursor = addDays(cursor, 1);
  }

  return buckets;
}

export function getCreatedDate(value: string | null | undefined) {
  if (!value) return null;
  return value.slice(0, 10);
}

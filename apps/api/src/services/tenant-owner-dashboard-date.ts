import { Errors } from "@/errors/error-factory";
import type { TenantOwnerDailyDashboardQuery } from "@/schema/tenant-owner-daily-dashboard";
import type { TenantOwnerBusinessDayRange } from "@/services/tenant-owner-daily-dashboard-types";

export function resolveTenantOwnerBusinessDay(
  query: TenantOwnerDailyDashboardQuery,
): TenantOwnerBusinessDayRange {
  const businessDate = query.date ?? getDateInTimezone(query.timezone);
  return {
    businessDate,
    timezone: query.timezone,
    startAt: getTimezoneDateBoundary(businessDate, query.timezone),
    endAt: getTimezoneDateBoundary(addDays(businessDate, 1), query.timezone),
  };
}

export function getDateInTimezone(timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    throw Errors.badRequest("timezone 参数非法");
  }
}

function getTimezoneDateBoundary(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) {
    throw Errors.badRequest("date 参数非法");
  }

  let utcTime = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  for (let index = 0; index < 3; index += 1) {
    const local = getTimezoneParts(new Date(utcTime), timezone);
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    const targetAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    utcTime -= localAsUtc - targetAsUtc;
  }

  return new Date(utcTime).toISOString();
}

function getTimezoneParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const hour = Number(lookup.get("hour") ?? 0);
  return {
    year: Number(lookup.get("year")),
    month: Number(lookup.get("month")),
    day: Number(lookup.get("day")),
    hour: hour === 24 ? 0 : hour,
    minute: Number(lookup.get("minute") ?? 0),
    second: Number(lookup.get("second") ?? 0),
  };
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

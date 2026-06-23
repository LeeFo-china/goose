import type {
  ProcedureAssignmentEffectiveStatus,
  ProcedureAssignmentScheduleStatus,
  ProcedureAssignmentStatus,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function calculatePlannedEndDate(
  startDate: string,
  durationDays: number,
): string {
  const start = parseDateOnly(startDate);
  const end = new Date(start.getTime() + (durationDays - 1) * DAY_MS);
  return formatDateOnly(end);
}

export function getEffectiveAssignmentStatus(input: {
  status: ProcedureAssignmentStatus;
  plannedStartDate: string;
  tenantToday: string;
}): ProcedureAssignmentEffectiveStatus {
  if (input.status !== "planned") {
    return input.status;
  }

  return input.plannedStartDate <= input.tenantToday ? "in_progress" : "planned";
}

export function calculateRemainingDays(input: {
  plannedEndDate: string;
  tenantToday: string;
}): number {
  return Math.floor(
    (parseDateOnly(input.plannedEndDate).getTime() -
      parseDateOnly(input.tenantToday).getTime()) /
      DAY_MS,
  );
}

export function getScheduleStatus(input: {
  effectiveStatus: ProcedureAssignmentEffectiveStatus;
  plannedStartDate: string;
  plannedEndDate: string;
  tenantToday: string;
}): ProcedureAssignmentScheduleStatus {
  if (input.effectiveStatus === "completed") {
    return "completed";
  }
  if (input.effectiveStatus === "canceled") {
    return "canceled";
  }
  if (input.effectiveStatus === "planned") {
    return "not_started";
  }

  const remainingDays = calculateRemainingDays({
    plannedEndDate: input.plannedEndDate,
    tenantToday: input.tenantToday,
  });

  if (remainingDays < 0) {
    return "overdue";
  }
  if (remainingDays === 0) {
    return "due_today";
  }

  return "on_track";
}

export function hasDateRangeOverlap(input: {
  leftStart: string;
  leftEnd: string;
  rightStart: string;
  rightEnd: string;
}): boolean {
  return input.leftStart <= input.rightEnd && input.rightStart <= input.leftEnd;
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

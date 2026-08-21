import type { Appointment, Pagination } from "./leads-workbench-logic";

export type LeadPageTarget = { leadId: string; page: number; pageSize: number };
export type LeadPagedData<T> = { list: T[]; pagination: Pagination };
export type LeadPageState<T> = { data: LeadPagedData<T>; error: string | null };
export type LeadPageActivity = { loading: boolean; error: string | null };
export type LeadPageEvent<T> = { type: "success"; data: LeadPagedData<T> }
  | { type: "failed" | "invalid"; message: string };

export function createLatestLeadPageTarget(initial: LeadPageTarget) {
  let target = { ...initial };
  return {
    update(next: LeadPageTarget): void { target = { ...next }; },
    current(): LeadPageTarget { return { ...target }; },
  };
}

export function transitionLeadPageState<T>(current: LeadPageState<T>,
  event: LeadPageEvent<T>): LeadPageState<T> {
  return event.type === "success"
    ? { data: event.data, error: null }
    : { data: current.data, error: event.message };
}

export function resetLeadPageActivity(_current?: LeadPageActivity): LeadPageActivity {
  return { loading: false, error: null };
}

export function resolveAppointmentSelection(currentId: string,
  appointments: readonly Appointment[]): string {
  return appointments.some((item) => item.id === currentId)
    ? currentId : appointments[0]?.id ?? "";
}

export function formatLeadAppointmentOption(item: Appointment): string {
  const period = { morning: "上午", afternoon: "下午", evening: "晚上" }[
    item.preferred_visit_period
  ];
  const status = { pending_confirmation: "待确认", confirmed: "已确认",
    completed: "已完成", canceled: "已取消", invalid: "已作废" }[item.status];
  return `${item.appointment_no} · ${item.preferred_visit_date} ${period} · ${item.community} · ${status}`;
}

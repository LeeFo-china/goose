export { Errors } from "@/errors/error-factory";
export {
  customerServiceTicketRepository,
  type CustomerServiceTicketActionRecord,
  type CustomerServiceTicketRecord,
} from "@/repositories/customer-service-tickets";
import type { CustomerServiceTicketRecord } from "@/repositories/customer-service-tickets";
export type {
  AssignCustomerServiceTicketInput,
  CreateCustomerServiceTicketInput,
  CustomerServiceTicketActionInput,
  CustomerServiceTicketListQuery,
} from "@/schema/customer-service";
export { accessPolicyService } from "@/services/access-policy";
export type { AuthContext } from "@/services/authorization";
export { resolveStoredFileUrlList } from "@/services/files/file-url-resolver";
export { notificationService } from "@/services/notifications";
export { systemSettingsService } from "@/services/system-settings";
export {
  CustomerServiceTicketActionConfig,
  CustomerServiceTicketCategoryConfig,
  CustomerServiceTicketPriorityConfig,
  CustomerServiceTicketStatusConfig,
  isCustomerServiceTicketStatus,
  listCustomerServiceTicketActions,
  type CustomerServiceTicketAction,
  type CustomerServiceTicketStatus,
} from "@gooes/domain";

export type CustomerTicketContext = {
  id: string;
  tenant_id: string | null;
  owner_id?: string | null;
  name?: string | null;
  phone?: string | null;
};

export type RelationObject = Record<string, unknown>;

export function normalizeRelation(value: unknown): RelationObject | null {
  if (Array.isArray(value)) {
    return normalizeRelation(value[0]);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  return value as RelationObject;
}

export function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function getTicketCustomerName(row: CustomerServiceTicketRecord) {
  const customer = normalizeRelation(row.customer);
  return asString(customer?.name) || asString(customer?.phone);
}

export function maskPhone(value: string | null | undefined) {
  const phone = value?.trim();
  if (!phone) return null;
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function buildTicketNo() {
  const now = new Date();
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CS${timestamp}${random}`;
}

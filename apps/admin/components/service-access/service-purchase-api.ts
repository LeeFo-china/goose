import type {
  AdminServiceAccessAction,
  AdminTenantServiceAccess,
} from "@gooes/domain";
import { z } from "zod";

import { requestBackendJson } from "@/lib/backend-client";

const PRODUCT_LIST_PATH = "/billing/service-products?page=1&pageSize=20";
const ORDER_LIST_PATH = "/billing/service-orders?page=1&pageSize=20";
const PURCHASE_LINK_PATH = "/employee/service-access/purchase-link";
const PURCHASE_PERMISSION = "billing.service_order.create";
const ORDER_READ_PERMISSION = "billing.service_order.read";
const RECOVERY_ACCESS_STATUSES = new Set<
  AdminTenantServiceAccess["accessStatus"]
>([
  "pending_review",
  "scheduled",
  "grace_period",
  "expired",
  "service_blocked",
]);

const PaginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
}).strict();

const ServiceProductSchema = z.object({
  id: z.uuid(),
  code: z.string().trim().min(1),
  status: z.enum(["draft", "enabled", "disabled", "archived"]),
  published_version_id: z.uuid().nullable(),
  title: z.string().trim().min(1),
  term_years: z.number().int().positive(),
  list_amount_fen: z.number().int().nonnegative(),
  amount_fen: z.number().int().nonnegative(),
  price_rate_basis_points: z.number().int().nonnegative(),
  pricing_version: z.number().int().positive(),
  service_scope: z.array(z.string().trim().min(1)),
  terms_version: z.number().int().positive(),
  terms_content: z.string(),
}).strict();

const ServiceOrderActionSchema = z.object({
  enabled: z.boolean(),
  label: z.string().trim().min(1),
  disabled_reason: z.string().nullable(),
}).strict();

const ServiceOrderSchema = z.object({
  id: z.uuid(),
  order_no: z.string().trim().min(1),
  product_code: z.string().trim().min(1),
  term_years: z.number().int().positive(),
  amount_fen: z.number().int().nonnegative(),
  payment_status: z.string().trim().min(1),
  service_status: z.string().trim().min(1),
  display_stage: z.string().trim().min(1),
  payment_expires_at: z.iso.datetime({ offset: true }),
  paid_at: z.iso.datetime({ offset: true }).nullable(),
  closed_at: z.iso.datetime({ offset: true }).nullable(),
  pricing_version: z.number().int().positive().optional(),
  terms_version: z.number().int().positive(),
  version: z.number().int().positive(),
  available_actions: z.object({
    continue_payment: ServiceOrderActionSchema,
    cancel_payment: ServiceOrderActionSchema,
    request_refund: ServiceOrderActionSchema,
  }).strict(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
}).strict();

const ServiceProductPageSchema = z.object({
  list: z.array(ServiceProductSchema),
  pagination: PaginationSchema,
}).strict();

const ServiceOrderPageSchema = z.object({
  list: z.array(ServiceOrderSchema),
  pagination: PaginationSchema,
  server_time: z.iso.datetime({ offset: true }),
}).strict();

const ServicePurchaseLinkSchema = z.object({
  url: z.url({ protocol: /^https$/ }).max(2_048),
  expires_at: z.iso.datetime({ offset: true }),
}).strict();

export type ServiceProduct = z.infer<typeof ServiceProductSchema>;
export type ServiceOrder = z.infer<typeof ServiceOrderSchema>;
export type ServiceProductPage = z.infer<typeof ServiceProductPageSchema>;
export type ServiceOrderPage = z.infer<typeof ServiceOrderPageSchema>;
export type ServicePurchaseLink = z.infer<typeof ServicePurchaseLinkSchema>;

export type ServicePurchaseRequester = <Response = unknown>(
  path: string,
  init?: Parameters<typeof requestBackendJson>[1],
) => Promise<Response>;

export async function listServiceProductsIfPermitted(
  canPurchase: boolean,
  requester: ServicePurchaseRequester = requestBackendJson,
): Promise<ServiceProductPage | null> {
  if (!canPurchase) return null;
  const payload = await requester<unknown>(PRODUCT_LIST_PATH, {
    cache: "no-store",
    fallbackMessage: "服务套餐加载失败",
  });
  return parseResponse(
    ServiceProductPageSchema,
    payload,
    "服务套餐数据格式异常，请稍后重试",
  );
}

export async function listServiceOrdersIfPermitted(
  canReadOrders: boolean,
  requester: ServicePurchaseRequester = requestBackendJson,
): Promise<ServiceOrderPage | null> {
  if (!canReadOrders) return null;
  const payload = await requester<unknown>(ORDER_LIST_PATH, {
    cache: "no-store",
    fallbackMessage: "服务订单加载失败",
  });
  return parseResponse(
    ServiceOrderPageSchema,
    payload,
    "服务订单数据格式异常，请稍后重试",
  );
}

export async function getServicePurchaseLink(
  requester: ServicePurchaseRequester = requestBackendJson,
): Promise<ServicePurchaseLink> {
  const payload = await requester<unknown>(PURCHASE_LINK_PATH, {
    method: "POST",
    fallbackMessage: "购买链接生成失败",
  });
  return parseResponse(
    ServicePurchaseLinkSchema,
    payload,
    "购买链接数据格式异常，请稍后重试",
  );
}

export function getServicePurchaseCapabilities(
  actionKeys: readonly AdminServiceAccessAction["key"][],
  permissionCodes: readonly string[],
): { canPurchase: boolean; canReadOrders: boolean } {
  return {
    canPurchase: actionKeys.includes("purchase_service")
      && permissionCodes.includes(PURCHASE_PERMISSION),
    canReadOrders: permissionCodes.includes(ORDER_READ_PERMISSION),
  };
}

export function shouldRenderServicePurchaseSection(input: {
  accessStatus: AdminTenantServiceAccess["accessStatus"] | null;
  canPurchase: boolean;
  canReadOrders: boolean;
}): boolean {
  return input.accessStatus !== null
    && RECOVERY_ACCESS_STATUSES.has(input.accessStatus)
    && (input.canPurchase || input.canReadOrders);
}

export function shouldAutomaticallyReturnFromServiceAccess(
  accessStatus: AdminTenantServiceAccess["accessStatus"] | "bypass" | null,
): boolean {
  return accessStatus === "bypass" || accessStatus === "workspace_available";
}

export function formatServiceAmountFen(amountFen: number): string {
  if (!Number.isSafeInteger(amountFen) || amountFen < 0) return "—";
  const yuan = Math.floor(amountFen / 100).toLocaleString("zh-CN");
  const fen = String(amountFen % 100).padStart(2, "0");
  return `¥${yuan}.${fen}`;
}

export function formatServicePurchaseError(
  error: unknown,
  fallbackMessage: string,
): string {
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : fallbackMessage;
  const requestId = getSafeRequestId(error);
  return requestId ? `${message}（Request-ID：${requestId}）` : message;
}

export function copyServicePurchaseLink(
  link: ServicePurchaseLink,
  writeText: (value: string) => Promise<void>,
  nowMs: number = Date.now(),
): Promise<void> {
  if (getServicePurchaseLinkRemainingMs(link, nowMs) === 0) {
    return Promise.reject(new Error("购买链接已过期，请重新生成"));
  }
  return writeText(link.url);
}

export function getServicePurchaseLinkRemainingMs(
  link: ServicePurchaseLink,
  nowMs: number = Date.now(),
): number {
  const remainingMs = Date.parse(link.expires_at) - nowMs;
  return Number.isFinite(remainingMs) && remainingMs > 0 ? remainingMs : 0;
}

export function createServicePurchaseHandoffLifecycle(input: {
  requestLink: () => Promise<ServicePurchaseLink>;
  isAuthorized: () => boolean;
  retainResult: (result: ServicePurchaseLink) => void;
  navigate: (url: string) => void;
  reportError: (error: unknown) => void;
}): {
  run: () => Promise<ServicePurchaseLink | null>;
  invalidate: () => void;
} {
  let generation = 0;
  let inFlight: Promise<ServicePurchaseLink | null> | null = null;

  function isCurrent(runGeneration: number): boolean {
    return generation === runGeneration && input.isAuthorized();
  }

  return {
    run(): Promise<ServicePurchaseLink | null> {
      if (!input.isAuthorized()) return Promise.resolve(null);
      if (inFlight) return inFlight;
      const runGeneration = generation;
      const request = callPurchaseLinkRequester(input.requestLink);
      const current = request
        .then((result) => {
          if (!isCurrent(runGeneration)) return null;
          input.retainResult(result);
          if (!isCurrent(runGeneration)) return null;
          input.navigate(result.url);
          return result;
        })
        .catch((error: unknown) => {
          if (isCurrent(runGeneration)) input.reportError(error);
          return null;
        })
        .finally(() => {
          if (inFlight === current) inFlight = null;
        });
      inFlight = current;
      return current;
    },
    invalidate(): void {
      generation += 1;
      inFlight = null;
    },
  };
}

function callPurchaseLinkRequester(
  requester: () => Promise<ServicePurchaseLink>,
): Promise<ServicePurchaseLink> {
  try {
    return requester();
  } catch (error) {
    return Promise.reject(error);
  }
}

function parseResponse<Output>(
  schema: z.ZodType<Output>,
  payload: unknown,
  errorMessage: string,
): Output {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(errorMessage);
  return parsed.data;
}

function getSafeRequestId(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("requestId" in error)) {
    return null;
  }
  const requestId = error.requestId;
  if (typeof requestId !== "string") return null;
  const normalized = requestId.trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(normalized) ? normalized : null;
}

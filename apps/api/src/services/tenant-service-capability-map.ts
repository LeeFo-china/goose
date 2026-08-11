import type {
  PlatformServiceTrialCapability,
  TenantServiceRouteAccess,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";

export type TenantServiceCapabilityRoute = {
  method: string;
  url: string;
  access: TenantServiceRouteAccess;
};

export type TenantServiceCapabilityRule = {
  id: string;
  kind: "capability" | "excluded";
  capability?: PlatformServiceTrialCapability;
  reason?: string;
  pattern: RegExp;
  priority?: number;
};

export type TenantServiceCapabilityResolution =
  | { kind: "capability"; capability: PlatformServiceTrialCapability }
  | { kind: "excluded"; reason: string };

const CAPABILITY_RULES: readonly TenantServiceCapabilityRule[] = [
  capability("projects", "core.projects", /^\/(?:projects|project[-_][^/]+|properties|front|create_project_page|home_stats)(?:\/|$)/),
  capability("customer-projects", "core.projects", /^\/customer\/(?:projects|project-acceptances)(?:\/|$)/, 20),
  capability("customers", "core.customers", /^\/(?:customers|customer-service-tickets|customer_follow_ups|external-referrers)(?:\/|$)/),
  capability("customer-self-service", "core.customers", /^\/customer\/(?:service-tickets|profile|bootstrap)(?:\/|$)/, 20),
  capability("employees", "core.employees", /^\/(?:employees|departments|roles|permissions|department-post-rules)(?:\/|$)/),
  capability("employee-self-service", "core.employees", /^\/employee\/(?:bootstrap|personalization)(?:\/|$)/, 20),
  capability("workflows", "core.workflows", /^\/(?:workflows|workflow-subjects|workflow-tasks|task-center)(?:\/|$)/),
  capability("files", "core.files", /^\/uploads(?:\/|$)/),
  capability("notifications", "core.notifications", /^\/notifications(?:\/|$)/),
];

const EXCLUDED_TOP_LEVEL = [
  "admin", "ai", "appointment-reward-claim-vouchers", "auth", "billing",
  "branding", "catalog", "expense-request-categories", "expense-requests",
  "finance", "internal", "marketing-leads", "marketing-pages", "ocr",
  "partner", "partner-onboarding", "payments", "platform", "posts", "public",
  "share-campaign-claim-vouchers", "share-campaigns", "social-video",
  "supplier-payable-filter-options", "supplier-payables",
  "supplier-payment-request-payable-facts", "supplier-payment-requests",
  "supplier-price-lists", "supplier-products", "supplier-purchase-order-catalog",
  "supplier-purchase-order-project-options", "supplier-purchase-order-supplier-options",
  "supplier-purchase-orders", "supplier-purchase-requisition-catalog",
  "supplier-purchase-requisition-cost-categories",
  "supplier-purchase-requisition-project-options",
  "supplier-purchase-requisition-supplier-options", "supplier-purchase-requisitions",
  "supplier-settings", "suppliers", "tenant", "tenant-devices", "tenant-onboarding",
  "tenant-share-links", "usage", "visitor", "wechat",
] as const;

const EXCLUDED_RULES: readonly TenantServiceCapabilityRule[] = [
  excluded(
    "non-trial-products",
    new RegExp(`^/(?:${EXCLUDED_TOP_LEVEL.join("|")})(?:/|$)`),
    "not_trial_capability",
  ),
  excluded("customer-non-core", /^\/customer(?:\/|$)/, "not_trial_capability"),
  excluded("employee-non-core", /^\/employee(?:\/|$)/, "not_trial_capability"),
];

export const TENANT_SERVICE_CAPABILITY_RULES = [
  ...CAPABILITY_RULES,
  ...EXCLUDED_RULES,
] as const;

const HTTP_METHODS = new Set([
  "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT",
]);

export function matchTenantServiceRouteCapabilityRules(
  input: TenantServiceCapabilityRoute,
  rules: readonly TenantServiceCapabilityRule[] = TENANT_SERVICE_CAPABILITY_RULES,
): TenantServiceCapabilityRule[] {
  if (!HTTP_METHODS.has(input.method.toUpperCase())) return [];
  const matches = rules.filter((rule) => {
    rule.pattern.lastIndex = 0;
    return rule.pattern.test(input.url);
  });
  if (matches.length === 0) return [];
  const priority = Math.max(...matches.map((rule) => rule.priority ?? 0));
  return matches.filter((rule) => (rule.priority ?? 0) === priority);
}

export function resolveTenantServiceRouteCapability(
  input: TenantServiceCapabilityRoute,
): TenantServiceCapabilityResolution {
  if (input.access === "session" || input.access === "recovery"
    || input.access === "public_or_callback") {
    return { kind: "excluded", reason: "route_access" };
  }
  return resolveTenantServiceRouteCapabilityFromRules(
    input,
    TENANT_SERVICE_CAPABILITY_RULES,
  );
}

export function resolveTenantServiceRouteCapabilityFromRules(
  input: TenantServiceCapabilityRoute,
  rules: readonly TenantServiceCapabilityRule[],
): TenantServiceCapabilityResolution {
  const matches = matchTenantServiceRouteCapabilityRules(input, rules);
  if (matches.length === 0) {
    throw Errors.business(
      500,
      "租户服务路由未映射能力",
      "TENANT_SERVICE_ROUTE_CAPABILITY_UNMAPPED",
    );
  }
  if (matches.length > 1) {
    throw Errors.business(
      500,
      "租户服务路由能力映射冲突",
      "TENANT_SERVICE_ROUTE_CAPABILITY_AMBIGUOUS",
    );
  }
  const [match] = matches;
  if (match?.kind === "capability" && match.capability) {
    return { kind: "capability", capability: match.capability };
  }
  return { kind: "excluded", reason: match?.reason ?? "not_trial_capability" };
}

function capability(
  id: string,
  value: PlatformServiceTrialCapability,
  pattern: RegExp,
  priority = 10,
): TenantServiceCapabilityRule {
  return { id, kind: "capability", capability: value, pattern, priority };
}

function excluded(
  id: string,
  pattern: RegExp,
  reason: string,
  priority = 1,
): TenantServiceCapabilityRule {
  return { id, kind: "excluded", reason, pattern, priority };
}

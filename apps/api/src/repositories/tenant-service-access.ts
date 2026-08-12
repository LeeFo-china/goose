import {
  PLATFORM_SERVICE_TRIAL_SOURCE_VALUES,
  PLATFORM_SERVICE_TRIAL_STATUS_VALUES,
  PlatformServiceTrialScopeSchema,
  type PlatformServiceTrialScopeV1,
  type PlatformServiceTrialSource,
  type PlatformServiceTrialStatus,
} from "@gooes/domain";
import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type { TenantBillingSubscriptionStatus } from "@/repositories/billing-subscriptions";
import { SupabaseDB } from "@/utils/supabase/index";

export type TenantServiceContractAccessFact = {
  id: string;
  service_start_at: string;
  service_end_at: string;
};

export type TenantServicePaidOnboardingFact = {
  id: string;
  paid_at: string;
};

export type TenantServiceTrialAccessFact = {
  id: string;
  tenant_id: string;
  source: PlatformServiceTrialSource;
  status: "active" | "grace_period";
  starts_at: string;
  trial_ends_at: string;
  grace_ends_at: string;
  scope_snapshot: PlatformServiceTrialScopeV1;
};

export type TenantServiceLatestTrialFact = {
  id: string;
  tenant_id: string;
  status: PlatformServiceTrialStatus;
  starts_at: string | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
};

export type TenantServiceAccessFacts = {
  evaluatedAt: string;
  tenantStatus: string | null;
  contract: TenantServiceContractAccessFact | null;
  paidOnboardingOrder: TenantServicePaidOnboardingFact | null;
  legacySubscriptionStatus: TenantBillingSubscriptionStatus | null;
  currentTrial: TenantServiceTrialAccessFact | null;
  latestTrial: TenantServiceLatestTrialFact | null;
};

export type GetTenantServiceAccessFactsInput = { tenantId: string };

export interface TenantServiceAccessRepositoryPort {
  getAccessFacts(
    input: GetTenantServiceAccessFactsInput,
  ): Promise<TenantServiceAccessFacts>;
}

type QueryResult = { data: unknown; error: unknown };
type UntypedClient = {
  rpc: (
    name: "platform_service_trial_access_facts",
    params: { p_tenant_id: string },
  ) => PromiseLike<QueryResult>;
};

const dateTime = z.iso.datetime({ offset: true });
const latestTrialSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  status: z.enum(PLATFORM_SERVICE_TRIAL_STATUS_VALUES),
  starts_at: dateTime.nullable(),
  trial_ends_at: dateTime.nullable(),
  grace_ends_at: dateTime.nullable(),
}).strict().superRefine((trial, context) => {
  const times = [trial.starts_at, trial.trial_ends_at, trial.grace_ends_at];
  const hasAllTimes = times.every((value) => value !== null);
  const hasNoTimes = times.every((value) => value === null);
  const requiresTimes = [
    "scheduled", "active", "grace_period", "expired", "revoked",
  ].includes(trial.status);
  const requiresNoTimes = [
    "pending_review", "rejected", "withdrawn",
  ].includes(trial.status);
  if (requiresTimes && !hasAllTimes || requiresNoTimes && !hasNoTimes
    || trial.status === "converted" && !hasAllTimes && !hasNoTimes) {
    context.addIssue({ code: "custom", message: "latest trial time invalid" });
    return;
  }
  if (!hasAllTimes) return;
  if (Date.parse(trial.starts_at!) >= Date.parse(trial.trial_ends_at!)
    || Date.parse(trial.trial_ends_at!) > Date.parse(trial.grace_ends_at!)) {
    context.addIssue({ code: "custom", message: "latest trial range invalid" });
  }
});
const accessFactsSchema = z.object({
  server_time: dateTime,
  tenant_id: z.uuid(),
  tenant_status: z.string().trim().min(1).nullable(),
  contract: z.object({
    id: z.uuid(),
    service_start_at: dateTime,
    service_end_at: dateTime,
  }).strict().nullable(),
  paid_onboarding_order: z.object({
    id: z.uuid(),
    paid_at: dateTime,
  }).strict().nullable(),
  legacy_subscription_status: z.enum([
    "active", "past_due", "locked", "canceled",
  ]).nullable(),
  current_trial: z.object({
    id: z.uuid(),
    tenant_id: z.uuid(),
    source: z.enum(PLATFORM_SERVICE_TRIAL_SOURCE_VALUES),
    status: z.enum(["active", "grace_period"]),
    starts_at: dateTime,
    trial_ends_at: dateTime,
    grace_ends_at: dateTime,
    scope_snapshot: PlatformServiceTrialScopeSchema,
  }).strict().nullable(),
  latest_trial: latestTrialSchema.nullable().optional(),
}).strict().superRefine((facts, context) => {
  const now = Date.parse(facts.server_time);
  const contract = facts.contract;
  if (contract && (
    Date.parse(contract.service_start_at) > now
    || Date.parse(contract.service_end_at) <= now
  )) context.addIssue({ code: "custom", message: "contract time invalid" });
  if (
    facts.paid_onboarding_order
    && Date.parse(facts.paid_onboarding_order.paid_at) > now
  ) context.addIssue({ code: "custom", message: "paid order time invalid" });

  const trial = facts.current_trial;
  if (trial) {
    const startsAt = Date.parse(trial.starts_at);
    const trialEndsAt = Date.parse(trial.trial_ends_at);
    const graceEndsAt = Date.parse(trial.grace_ends_at);
    if (
      startsAt >= trialEndsAt || trialEndsAt > graceEndsAt
      || now < startsAt || now >= graceEndsAt
      || trial.status === "active" && now >= trialEndsAt
      || trial.status === "grace_period" && now < trialEndsAt
    ) context.addIssue({ code: "custom", message: "trial time invalid" });
  }

  const latestTrial = facts.latest_trial;
  if (!latestTrial?.starts_at || !latestTrial.trial_ends_at
    || !latestTrial.grace_ends_at) return;
  const latestStartsAt = Date.parse(latestTrial.starts_at);
  const latestTrialEndsAt = Date.parse(latestTrial.trial_ends_at);
  const latestGraceEndsAt = Date.parse(latestTrial.grace_ends_at);
  if (latestTrial.status === "scheduled" && now >= latestStartsAt
    || latestTrial.status === "active"
      && (now < latestStartsAt || now >= latestTrialEndsAt)
    || latestTrial.status === "grace_period"
      && (now < latestTrialEndsAt || now >= latestGraceEndsAt)
    || latestTrial.status === "expired" && now < latestGraceEndsAt) {
    context.addIssue({ code: "custom", message: "latest trial status invalid" });
  }
});

export class TenantServiceAccessRepository
  implements TenantServiceAccessRepositoryPort {
  constructor(
    private readonly clientProvider: () => UntypedClient = () =>
      SupabaseDB.getAdminClient() as unknown as UntypedClient,
  ) {}

  async getAccessFacts(
    input: GetTenantServiceAccessFactsInput,
  ): Promise<TenantServiceAccessFacts> {
    let result: QueryResult;
    try {
      result = await this.clientProvider().rpc(
        "platform_service_trial_access_facts",
        { p_tenant_id: input.tenantId },
      );
    } catch {
      throw Errors.dbError("查询租户服务访问事实失败");
    }
    if (result.error) throw Errors.dbError("查询租户服务访问事实失败");

    const parsed = accessFactsSchema.safeParse(result.data);
    if (
      !parsed.success
      || parsed.data.tenant_id !== input.tenantId
      || parsed.data.current_trial !== null
        && parsed.data.current_trial.tenant_id !== input.tenantId
      || parsed.data.latest_trial != null
        && parsed.data.latest_trial.tenant_id !== input.tenantId
    ) throw Errors.dbError("查询租户服务访问事实失败");

    return {
      evaluatedAt: parsed.data.server_time,
      tenantStatus: parsed.data.tenant_status,
      contract: parsed.data.contract,
      paidOnboardingOrder: parsed.data.paid_onboarding_order,
      legacySubscriptionStatus: parsed.data.legacy_subscription_status,
      currentTrial: parsed.data.current_trial,
      latestTrial: parsed.data.latest_trial ?? null,
    };
  }
}

export const tenantServiceAccessRepository =
  new TenantServiceAccessRepository();

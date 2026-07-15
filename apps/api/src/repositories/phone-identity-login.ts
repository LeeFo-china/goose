import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

type RpcPort = {
  rpc: (name: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: unknown;
  }>;
};

export type ClaimVerificationInput = {
  phone: string;
  code: string;
  authUserId: string;
  openidHash: string;
  now: string;
  expiresAt: string;
};

export type ClaimVerificationResult =
  | { status: "claimed"; sessionId: string }
  | { status: "sms_invalid" | "sms_expired"; sessionId: null };

export type BeginSelectionStatus =
  | "ready"
  | "session_not_found"
  | "session_expired"
  | "state_conflict";

export type BeginSelectionInput = {
  sessionId: string;
  authUserId: string;
  openidHash: string;
  selectionTokenHash: string;
  shareContext: Record<string, unknown>;
  candidates: ReadonlyArray<Record<string, unknown>>;
  now: string;
};

export type ReserveSelectionInput = {
  selectionTokenHash: string;
  candidateId: string;
  authUserId: string;
  openidHash: string;
  now: string;
};

export type PhoneIdentityTargetMode =
  | "customer"
  | "tenant_employee"
  | "platform_partner";

export type ReserveSelectionResult =
  | {
    status:
      | "reserved"
      | "same_candidate_in_progress"
      | "same_candidate_consumed";
    sessionId: string;
    candidate: {
      id: string;
      targetMode: PhoneIdentityTargetMode;
      tenantId: string | null;
      customerId: string | null;
      employeeId: string | null;
      partnerId: string | null;
      partnerMemberId: string | null;
    };
  }
  | {
    status:
      | "selection_consumed"
      | "in_progress"
      | "expired"
      | "option_unavailable"
      | "session_not_found";
    sessionId: string | null;
  };

export type FinalizeSelectionInput = {
  sessionId: string;
  candidateId: string;
  now: string;
};

type RpcRow = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CLAIM_STATUSES = ["claimed", "sms_invalid", "sms_expired"] as const;
const BEGIN_STATUSES = [
  "ready",
  "session_not_found",
  "session_expired",
  "state_conflict",
] as const;
const RESERVE_WITH_CANDIDATE_STATUSES = [
  "reserved",
  "same_candidate_in_progress",
  "same_candidate_consumed",
] as const;
const RESERVE_TERMINAL_STATUSES = [
  "selection_consumed",
  "in_progress",
  "expired",
  "option_unavailable",
  "session_not_found",
] as const;
const TARGET_MODES = [
  "customer",
  "tenant_employee",
  "platform_partner",
] as const;
const FINALIZE_STATUSES = ["consumed", "state_conflict"] as const;
const RELEASE_STATUSES = ["released", "consumed", "state_conflict"] as const;

export class PhoneIdentityLoginRepository {
  private rpcClient: RpcPort;

  constructor(
    rpcClient = SupabaseDB.getAdminClient() as unknown as RpcPort,
  ) {
    this.rpcClient = rpcClient;
  }

  async claimVerification(
    input: ClaimVerificationInput,
  ): Promise<ClaimVerificationResult> {
    const { data, error } = await this.rpcClient.rpc(
      "claim_phone_identity_login_verification",
      {
        p_phone: input.phone,
        p_code: input.code,
        p_auth_user_id: input.authUserId,
        p_openid_hash: input.openidHash,
        p_now: input.now,
        p_expires_at: input.expiresAt,
      },
    );

    if (error) throw invalidRpcResult(error);
    const row = parseSingleRpcRow(data);
    const status = parseStatus(row.status, CLAIM_STATUSES);
    if (status === "claimed") {
      return { status, sessionId: parseUuid(row.session_id) };
    }
    if (row.session_id === null) return { status, sessionId: null };
    throw invalidRpcResult(data);
  }

  async beginSelection(
    input: BeginSelectionInput,
  ): Promise<BeginSelectionStatus> {
    const { data, error } = await this.rpcClient.rpc(
      "begin_phone_identity_selection",
      {
        p_session_id: input.sessionId,
        p_auth_user_id: input.authUserId,
        p_openid_hash: input.openidHash,
        p_selection_token_hash: input.selectionTokenHash,
        p_share_context: input.shareContext,
        p_candidates: input.candidates,
        p_now: input.now,
      },
    );

    if (error) throw invalidRpcResult(error);
    const row = parseSingleRpcRow(data);
    return parseStatus(row.status, BEGIN_STATUSES);
  }

  async reserveSelection(
    input: ReserveSelectionInput,
  ): Promise<ReserveSelectionResult> {
    const { data, error } = await this.rpcClient.rpc(
      "reserve_phone_identity_selection",
      {
        p_selection_token_hash: input.selectionTokenHash,
        p_candidate_id: input.candidateId,
        p_auth_user_id: input.authUserId,
        p_openid_hash: input.openidHash,
        p_now: input.now,
      },
    );

    if (error) throw invalidRpcResult(error);
    const row = parseSingleRpcRow(data);
    const status = parseReserveStatus(row.status);
    if (isOneOf(status, RESERVE_WITH_CANDIDATE_STATUSES)) {
      return {
        status,
        sessionId: parseUuid(row.session_id),
        candidate: {
          id: input.candidateId,
          targetMode: parseStatus(row.target_mode, TARGET_MODES),
          tenantId: parseNullableUuid(row.tenant_id),
          customerId: parseNullableUuid(row.customer_id),
          employeeId: parseNullableUuid(row.employee_id),
          partnerId: parseNullableUuid(row.partner_id),
          partnerMemberId: parseNullableUuid(row.partner_member_id),
        },
      };
    }

    return {
      status,
      sessionId: status === "session_not_found"
        ? parseNullableUuid(row.session_id)
        : parseUuid(row.session_id),
    };
  }

  async finalizeSelection(
    input: FinalizeSelectionInput,
  ): Promise<"consumed" | "state_conflict"> {
    const { data, error } = await this.rpcClient.rpc(
      "finalize_phone_identity_selection",
      {
        p_session_id: input.sessionId,
        p_candidate_id: input.candidateId,
        p_now: input.now,
      },
    );

    if (error) throw invalidRpcResult(error);
    const row = parseSingleRpcRow(data);
    return parseStatus(row.status, FINALIZE_STATUSES);
  }

  async releaseSelection(
    input: FinalizeSelectionInput,
  ): Promise<"released" | "consumed" | "state_conflict"> {
    const { data, error } = await this.rpcClient.rpc(
      "release_phone_identity_selection",
      {
        p_session_id: input.sessionId,
        p_candidate_id: input.candidateId,
        p_now: input.now,
      },
    );

    if (error) throw invalidRpcResult(error);
    const row = parseSingleRpcRow(data);
    return parseStatus(row.status, RELEASE_STATUSES);
  }
}

export const phoneIdentityLoginRepository = new PhoneIdentityLoginRepository();

function parseSingleRpcRow(data: unknown): RpcRow {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw invalidRpcResult(data);
  }
  return row as RpcRow;
}

function parseReserveStatus(
  value: unknown,
): ReserveSelectionResult["status"] {
  if (isOneOf(value, RESERVE_WITH_CANDIDATE_STATUSES)) return value;
  if (isOneOf(value, RESERVE_TERMINAL_STATUSES)) return value;
  throw invalidRpcResult(value);
}

function parseStatus<const TValues extends readonly string[]>(
  value: unknown,
  allowedValues: TValues,
): TValues[number] {
  if (isOneOf(value, allowedValues)) return value;
  throw invalidRpcResult(value);
}

function parseUuid(value: unknown): string {
  if (typeof value === "string" && UUID_PATTERN.test(value)) {
    return value;
  }
  throw invalidRpcResult(value);
}

function parseNullableUuid(value: unknown): string | null {
  if (value === null) return null;
  return parseUuid(value);
}

function isOneOf<const TValues extends readonly string[]>(
  value: unknown,
  allowedValues: TValues,
): value is TValues[number] {
  return typeof value === "string" && allowedValues.includes(value);
}

function invalidRpcResult(details: unknown) {
  return Errors.dbError("统一手机号登录状态返回异常", details);
}

import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const repositoryModule = import("@/repositories/phone-identity-login");

const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const AUTH_USER_ID = "00000000-0000-4000-8000-000000000002";
const CANDIDATE_ID = "00000000-0000-4000-8000-000000000003";
const TENANT_ID = "00000000-0000-4000-8000-000000000004";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000005";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000006";
const PARTNER_ID = "00000000-0000-4000-8000-000000000007";
const PARTNER_MEMBER_ID = "00000000-0000-4000-8000-000000000008";
const NOW = "2026-07-15T10:00:00.000Z";

describe("PhoneIdentityLoginRepository", () => {
  test("calls claim verification RPC and validates a claimed session", async () => {
    const { PhoneIdentityLoginRepository } = await repositoryModule;
    const rpc = mock(async () => ({
      data: [{
        status: "claimed",
        session_id: SESSION_ID,
      }],
      error: null,
    }));
    const repository = new PhoneIdentityLoginRepository({ rpc });

    await expect(repository.claimVerification({
      phone: "13800138000",
      code: "123456",
      authUserId: AUTH_USER_ID,
      openidHash: "a".repeat(64),
      now: NOW,
      expiresAt: "2026-07-15T10:05:00.000Z",
    })).resolves.toEqual({
      status: "claimed",
      sessionId: SESSION_ID,
    });
    expect(rpc).toHaveBeenCalledWith(
      "claim_phone_identity_login_verification",
      {
        p_phone: "13800138000",
        p_code: "123456",
        p_auth_user_id: AUTH_USER_ID,
        p_openid_hash: "a".repeat(64),
        p_now: NOW,
        p_expires_at: "2026-07-15T10:05:00.000Z",
      },
    );
  });

  test("parses non-claimed SMS statuses with null session", async () => {
    const { PhoneIdentityLoginRepository } = await repositoryModule;

    for (const status of ["sms_invalid", "sms_expired"] as const) {
      const repository = new PhoneIdentityLoginRepository({
        rpc: async () => ({ data: [{ status, session_id: null }], error: null }),
      });

      await expect(repository.claimVerification({
        phone: "13800138000",
        code: "123456",
        authUserId: AUTH_USER_ID,
        openidHash: "a".repeat(64),
        now: NOW,
        expiresAt: "2026-07-15T10:05:00.000Z",
      })).resolves.toEqual({ status, sessionId: null });
    }
  });

  test("calls begin selection RPC with persisted candidate payload", async () => {
    const { PhoneIdentityLoginRepository } = await repositoryModule;
    const candidates = [{
      id: CANDIDATE_ID,
      target_mode: "customer",
      tenant_id: TENANT_ID,
      customer_id: CUSTOMER_ID,
      employee_id: null,
      partner_id: null,
      partner_member_id: null,
      binding_state: "bindable",
      display_snapshot: {
        role_label: "客户",
        title: "某某装饰",
        subtitle: "张三",
        rebind_kind: null,
      },
    }];
    const rpc = mock(async () => ({
      data: [{ status: "ready" }],
      error: null,
    }));
    const repository = new PhoneIdentityLoginRepository({ rpc });

    await expect(repository.beginSelection({
      sessionId: SESSION_ID,
      authUserId: AUTH_USER_ID,
      openidHash: "b".repeat(64),
      selectionTokenHash: "c".repeat(64),
      shareContext: { shareLinkId: "share-1" },
      candidates,
      now: NOW,
    })).resolves.toBe("ready");
    expect(rpc).toHaveBeenCalledWith("begin_phone_identity_selection", {
      p_session_id: SESSION_ID,
      p_auth_user_id: AUTH_USER_ID,
      p_openid_hash: "b".repeat(64),
      p_selection_token_hash: "c".repeat(64),
      p_share_context: { shareLinkId: "share-1" },
      p_candidates: candidates,
      p_now: NOW,
    });
  });

  test("parses all begin selection status values", async () => {
    const { PhoneIdentityLoginRepository } = await repositoryModule;

    for (const status of [
      "ready",
      "session_not_found",
      "session_expired",
      "state_conflict",
    ] as const) {
      const repository = new PhoneIdentityLoginRepository({
        rpc: async () => ({ data: [{ status }], error: null }),
      });

      await expect(repository.beginSelection({
        sessionId: SESSION_ID,
        authUserId: AUTH_USER_ID,
        openidHash: "b".repeat(64),
        selectionTokenHash: "c".repeat(64),
        shareContext: {},
        candidates: [],
        now: NOW,
      })).resolves.toBe(status);
    }
  });

  test("calls reserve selection RPC and maps candidate fields", async () => {
    const { PhoneIdentityLoginRepository } = await repositoryModule;
    const rpc = mock(async () => ({
      data: [{
        status: "reserved",
        session_id: SESSION_ID,
        verified_phone: "13800138000",
        target_mode: "tenant_employee",
        tenant_id: TENANT_ID,
        customer_id: null,
        employee_id: EMPLOYEE_ID,
        partner_id: null,
        partner_member_id: null,
      }],
      error: null,
    }));
    const repository = new PhoneIdentityLoginRepository({ rpc });

    await expect(repository.reserveSelection({
      selectionTokenHash: "d".repeat(64),
      candidateId: CANDIDATE_ID,
      authUserId: AUTH_USER_ID,
      openidHash: "e".repeat(64),
      now: NOW,
    })).resolves.toEqual({
      status: "reserved",
      sessionId: SESSION_ID,
      verifiedPhone: "13800138000",
      candidate: {
        id: CANDIDATE_ID,
        targetMode: "tenant_employee",
        tenantId: TENANT_ID,
        customerId: null,
        employeeId: EMPLOYEE_ID,
        partnerId: null,
        partnerMemberId: null,
      },
    });
    expect(rpc).toHaveBeenCalledWith("reserve_phone_identity_selection", {
      p_selection_token_hash: "d".repeat(64),
      p_candidate_id: CANDIDATE_ID,
      p_auth_user_id: AUTH_USER_ID,
      p_openid_hash: "e".repeat(64),
      p_now: NOW,
    });
  });

  test("parses reserve idempotent and terminal statuses", async () => {
    const { PhoneIdentityLoginRepository } = await repositoryModule;

    for (const status of [
      "same_candidate_in_progress",
      "same_candidate_consumed",
    ] as const) {
      const repository = new PhoneIdentityLoginRepository({
        rpc: async () => ({
          data: [{
            status,
            session_id: SESSION_ID,
            verified_phone: "13800138000",
            target_mode: "platform_partner",
            tenant_id: null,
            customer_id: null,
            employee_id: null,
            partner_id: PARTNER_ID,
            partner_member_id: PARTNER_MEMBER_ID,
          }],
          error: null,
        }),
      });

      await expect(repository.reserveSelection({
        selectionTokenHash: "d".repeat(64),
        candidateId: CANDIDATE_ID,
        authUserId: AUTH_USER_ID,
        openidHash: "e".repeat(64),
        now: NOW,
      })).resolves.toEqual({
        status,
        sessionId: SESSION_ID,
        verifiedPhone: "13800138000",
        candidate: {
          id: CANDIDATE_ID,
          targetMode: "platform_partner",
          tenantId: null,
          customerId: null,
          employeeId: null,
          partnerId: PARTNER_ID,
          partnerMemberId: PARTNER_MEMBER_ID,
        },
      });
    }

    for (const status of [
      "selection_consumed",
      "in_progress",
      "expired",
      "option_unavailable",
      "session_not_found",
    ] as const) {
      const repository = new PhoneIdentityLoginRepository({
        rpc: async () => ({
          data: [{ status, session_id: status === "session_not_found" ? null : SESSION_ID }],
          error: null,
        }),
      });

      await expect(repository.reserveSelection({
        selectionTokenHash: "d".repeat(64),
        candidateId: CANDIDATE_ID,
        authUserId: AUTH_USER_ID,
        openidHash: "e".repeat(64),
        now: NOW,
      })).resolves.toEqual({
        status,
        sessionId: status === "session_not_found" ? null : SESSION_ID,
      });
    }
  });

  test("finalizes and releases selected sessions", async () => {
    const { PhoneIdentityLoginRepository } = await repositoryModule;
    const finalizeRpc = mock(async (
      _name: string,
      _params: Record<string, unknown>,
    ) => ({
      data: [{ status: "consumed" }],
      error: null,
    }));
    const releaseRpc = mock(async (
      _name: string,
      _params: Record<string, unknown>,
    ) => ({
      data: [{ status: "released" }],
      error: null,
    }));
    const repository = new PhoneIdentityLoginRepository({
      rpc: mock(async (name: string, params: Record<string, unknown>) =>
        name === "finalize_phone_identity_selection"
          ? finalizeRpc(name, params)
          : releaseRpc(name, params),
      ),
    });

    await expect(repository.finalizeSelection({
      sessionId: SESSION_ID,
      candidateId: CANDIDATE_ID,
      now: NOW,
    })).resolves.toBe("consumed");
    await expect(repository.releaseSelection({
      sessionId: SESSION_ID,
      candidateId: CANDIDATE_ID,
      now: NOW,
    })).resolves.toBe("released");
    expect(finalizeRpc).toHaveBeenCalledWith(
      "finalize_phone_identity_selection",
      {
        p_session_id: SESSION_ID,
        p_candidate_id: CANDIDATE_ID,
        p_now: NOW,
      },
    );
    expect(releaseRpc).toHaveBeenCalledWith(
      "release_phone_identity_selection",
      {
        p_session_id: SESSION_ID,
        p_candidate_id: CANDIDATE_ID,
        p_now: NOW,
      },
    );
  });

  test("parses finalize and release conflict statuses", async () => {
    const { PhoneIdentityLoginRepository } = await repositoryModule;

    for (const status of ["consumed", "state_conflict"] as const) {
      const repository = new PhoneIdentityLoginRepository({
        rpc: async () => ({ data: [{ status }], error: null }),
      });
      await expect(repository.finalizeSelection({
        sessionId: SESSION_ID,
        candidateId: CANDIDATE_ID,
        now: NOW,
      })).resolves.toBe(status);
    }

    for (const status of ["released", "consumed", "state_conflict"] as const) {
      const repository = new PhoneIdentityLoginRepository({
        rpc: async () => ({ data: [{ status }], error: null }),
      });
      await expect(repository.releaseSelection({
        sessionId: SESSION_ID,
        candidateId: CANDIDATE_ID,
        now: NOW,
      })).resolves.toBe(status);
    }
  });

  test("wraps RPC errors and malformed RPC rows as database errors", async () => {
    const { PhoneIdentityLoginRepository } = await repositoryModule;
    const rpcFailure = new PhoneIdentityLoginRepository({
      rpc: async () => ({ data: null, error: { message: "rpc failed" } }),
    });

    await expect(rpcFailure.claimVerification({
      phone: "13800138000",
      code: "123456",
      authUserId: AUTH_USER_ID,
      openidHash: "a".repeat(64),
      now: NOW,
      expiresAt: "2026-07-15T10:05:00.000Z",
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });

    for (const data of [
      null,
      [],
      [{ status: "claimed", session_id: "not-a-uuid" }],
      [{ status: "unexpected", session_id: null }],
      [{ status: "claimed", session_id: SESSION_ID }, { status: "claimed", session_id: SESSION_ID }],
    ]) {
      const malformed = new PhoneIdentityLoginRepository({
        rpc: async () => ({ data, error: null }),
      });
      await expect(malformed.claimVerification({
        phone: "13800138000",
        code: "123456",
        authUserId: AUTH_USER_ID,
        openidHash: "a".repeat(64),
        now: NOW,
        expiresAt: "2026-07-15T10:05:00.000Z",
      })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
    }
  });
});

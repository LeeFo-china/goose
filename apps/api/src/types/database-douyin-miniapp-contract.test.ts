import { describe, expect, test } from "bun:test";

import type { Database } from "./database";
import type { Inserts, Tables, Updates } from "./db";

type DouyinFunctions = Database["public"]["Functions"];

describe("douyin miniapp database types", () => {
  test("exposes atomic marketing tables and RPC contracts", () => {
    const lead = {} as Tables<"marketing_leads">;
    const event = {} as Tables<"marketing_events">;
    const submission = {} as Tables<"douyin_miniapp_lead_submissions">;
    const submissionInsert: Inserts<"douyin_miniapp_lead_submissions"> = {
      already_submitted: false,
      douyin_miniapp_installation_id: "00000000-0000-4000-8000-000000000001",
      idempotency_key: "00000000-0000-4000-8000-000000000002",
      marketing_lead_id: "00000000-0000-4000-8000-000000000003",
      message: "你已提交预约，我们将尽快联系你",
      request_digest: "a".repeat(64),
      sms_verification_code_id: "00000000-0000-4000-8000-000000000004",
      tenant_id: "00000000-0000-4000-8000-000000000005",
      updated_existing: false,
    };
    const args: DouyinFunctions["submit_douyin_miniapp_lead"]["Args"] = {
      p_area: 120,
      p_attribution: { entry_path: "pages/home/index" },
      p_budget: "20-30万",
      p_community: "示例花园",
      p_consented_at: "2026-07-19T10:00:00.000Z",
      p_demand: "旧房改造",
      p_douyin_miniapp_installation_id: submissionInsert.douyin_miniapp_installation_id,
      p_idempotency_key: submissionInsert.idempotency_key,
      p_name: "李先生",
      p_phone: "13800000000",
      p_privacy_policy_version: "2026-07-19",
      p_request_digest: submissionInsert.request_digest,
      p_request_ip: "127.0.0.1",
      p_sms_code: "123456",
      p_start_time: "三个月内",
      p_subject_hash: "b".repeat(64),
      p_tenant_id: submissionInsert.tenant_id,
      p_user_agent: "Douyin Miniapp",
    };
    const returns: DouyinFunctions["submit_douyin_miniapp_lead"]["Returns"] = [{
      already_submitted: false,
      lead_id: submissionInsert.marketing_lead_id,
      message: submissionInsert.message,
      updated_existing: false,
    }];

    expect([
      lead.douyin_miniapp_installation_id,
      event.douyin_miniapp_installation_id,
      event.source,
      event.subject_hash,
      submission.sms_verification_code_id,
      args.p_idempotency_key,
      returns[0]!.lead_id,
    ]).toHaveLength(7);
  });

  test("exposes component and installation table contracts", () => {
    const component = {} as Tables<"douyin_third_party_components">;
    const installation = {} as Tables<"douyin_miniapp_installations">;
    const componentInsert: Inserts<"douyin_third_party_components"> = {
      component_appid: "tt-component",
    };
    const installationInsert: Inserts<"douyin_miniapp_installations"> = {
      authorizer_appid: "tt-authorizer",
      component_appid: "tt-component",
    };
    const componentUpdate: Updates<"douyin_third_party_components"> = {
      access_token_key_version: "v1",
      token_refresh_claim_token: null,
    };
    const installationUpdate: Updates<"douyin_miniapp_installations"> = {
      authorization_status: "active",
      runtime_config: { features: { cases: true } },
    };

    const fields = [
      component.component_appid,
      component.component_ticket_ciphertext,
      component.access_token_expires_at,
      component.token_refresh_last_error,
      componentInsert.component_appid,
      componentUpdate.access_token_key_version,
      installation.tenant_id,
      installation.authorizer_appid,
      installation.installation_kind,
      installation.authorization_status,
      installation.permission_snapshot,
      installation.runtime_config,
      installation.refresh_token_expires_at,
      installation.token_refresh_claim_expires_at,
      installation.template_release_id,
      installationInsert.authorizer_appid,
      installationUpdate.runtime_config,
    ];

    expect(fields).toHaveLength(17);
  });

  test("exposes the Douyin miniapp release ledger contract", () => {
    const release = {} as Tables<"douyin_miniapp_releases">;
    const releaseInsert: Inserts<"douyin_miniapp_releases"> = {
      installation_id: "00000000-0000-4000-8000-000000000001",
      template_id: "9133504853504535288",
      template_version: "1.0.0",
      description: "装修模板首个测试版本",
      channel: "default",
      ext_json: {
        extEnable: true,
        extAppid: "tt-authorizer",
        ext: { deployment_key: "00000000-0000-4000-8000-000000000002" },
      },
      platform_operator_id: "00000000-0000-4000-8000-000000000003",
    };
    const releaseUpdate: Updates<"douyin_miniapp_releases"> = {
      status: "audit_approved",
      audit_result: { status: "approved" },
      audited_at: "2026-07-20T10:00:00.000Z",
      operation_name: null,
      operation_claim_token: null,
      operation_claim_expires_at: null,
    };

    expect([
      release.installation_id,
      release.template_id,
      release.template_version,
      release.ext_json,
      release.test_qr_url,
      release.audit_host_names,
      release.operation_name,
      release.operation_claim_token,
      release.operation_claim_expires_at,
      release.platform_operator_id,
      releaseInsert.channel,
      releaseUpdate.audit_result,
    ]).toHaveLength(12);
  });

  test("exposes Douyin release operation claim RPC contracts", () => {
    const claimArgs: DouyinFunctions["claim_douyin_miniapp_release_operation"]["Args"] = {
      p_release_id: "00000000-0000-4000-8000-000000000001",
      p_expected_statuses: ["uploaded", "testing"],
      p_operation_name: "test_qr",
      p_claim_token: "00000000-0000-4000-8000-000000000002",
      p_claim_expires_at: "2026-07-20T10:05:00.000Z",
      p_operator_id: "00000000-0000-4000-8000-000000000003",
    };
    const claimReturns:
      DouyinFunctions["claim_douyin_miniapp_release_operation"]["Returns"] = [{
        release_id: claimArgs.p_release_id,
        claim_token: claimArgs.p_claim_token,
        claim_expires_at: claimArgs.p_claim_expires_at,
        recovery_required: false,
      }];
    const uploadArgs:
      DouyinFunctions["get_or_create_and_claim_douyin_miniapp_release_upload"]["Args"] = {
        p_installation_id: "00000000-0000-4000-8000-000000000004",
        p_template_id: "9133504853504535288",
        p_template_version: "1.0.0",
        p_description: "装修模板首发",
        p_channel: "default",
        p_ext_json: { extEnable: true, extAppid: "tt-app", ext: { deployment_key: "demo" } },
        p_claim_token: claimArgs.p_claim_token,
        p_claim_expires_at: claimArgs.p_claim_expires_at,
        p_operator_id: claimArgs.p_operator_id,
      };
    const uploadReturn = {} as
      DouyinFunctions["get_or_create_and_claim_douyin_miniapp_release_upload"]["Returns"][number];
    const syncArgs: DouyinFunctions["sync_douyin_miniapp_release_metadata"]["Args"] = {
      p_installation_id: uploadArgs.p_installation_id,
      p_release_id: claimArgs.p_release_id,
      p_claim_token: claimArgs.p_claim_token,
    };
    const syncReturn: DouyinFunctions["sync_douyin_miniapp_release_metadata"]["Returns"] = true;

    expect([
      claimReturns[0]!.recovery_required,
      uploadArgs.p_template_version,
      uploadReturn.operation_claim_token,
      uploadReturn.recovery_required,
      syncArgs.p_release_id,
      syncReturn,
    ]).toHaveLength(6);
  });

  test("exposes component refresh RPC signatures and returns", () => {
    const claimArgs: DouyinFunctions["claim_douyin_component_token_refresh"]["Args"] = {
      p_component_appid: "tt-component",
    };
    const claimReturns: DouyinFunctions["claim_douyin_component_token_refresh"]["Returns"] = [
      {
        claim_expires_at: "2026-07-19T10:00:30.000Z",
        claim_token: "00000000-0000-4000-8000-000000000001",
      },
    ];
    const claimReturn = claimReturns[0]!;
    const completeArgs: DouyinFunctions["complete_douyin_component_token_refresh"]["Args"] = {
      p_access_token_ciphertext: "ciphertext",
      p_access_token_expires_at: "2026-07-19T11:00:00.000Z",
      p_access_token_iv: "iv",
      p_access_token_key_version: "v1",
      p_access_token_tag: "tag",
      p_claim_token: claimReturn.claim_token,
      p_component_appid: claimArgs.p_component_appid,
    };
    const failArgs: DouyinFunctions["fail_douyin_component_token_refresh"]["Args"] = {
      p_claim_token: claimReturn.claim_token,
      p_component_appid: claimArgs.p_component_appid,
      p_last_refresh_error_code: "DOUYIN_COMPONENT_REFRESH_FAILED",
    };
    const completeReturns: DouyinFunctions["complete_douyin_component_token_refresh"]["Returns"] = true;
    const failReturns: DouyinFunctions["fail_douyin_component_token_refresh"]["Returns"] = true;

    expect([
      claimArgs.p_component_appid,
      claimReturn.claim_expires_at,
      completeArgs.p_access_token_key_version,
      failArgs.p_last_refresh_error_code,
      completeReturns,
      failReturns,
    ]).toHaveLength(6);
  });

  test("exposes authorizer refresh RPC signatures, returns, and rotation args", () => {
    const claimArgs: DouyinFunctions["claim_douyin_authorizer_token_refresh"]["Args"] = {
      p_installation_id: "00000000-0000-4000-8000-000000000002",
    };
    const claimReturns: DouyinFunctions["claim_douyin_authorizer_token_refresh"]["Returns"] = [
      {
        claim_expires_at: "2026-07-19T10:00:30.000Z",
        claim_token: "00000000-0000-4000-8000-000000000003",
      },
    ];
    const claimReturn = claimReturns[0]!;
    const forceClaimArgs:
      DouyinFunctions["claim_douyin_authorizer_token_force_refresh"]["Args"] = {
        p_expected_access_token_ciphertext: "rejected-access-ciphertext",
        p_installation_id: claimArgs.p_installation_id,
      };
    const completeArgs: DouyinFunctions["complete_douyin_authorizer_token_refresh"]["Args"] = {
      p_access_token_ciphertext: "access-ciphertext",
      p_access_token_expires_at: "2026-07-19T11:00:00.000Z",
      p_access_token_iv: "access-iv",
      p_access_token_key_version: "v2",
      p_access_token_tag: "access-tag",
      p_claim_token: claimReturn.claim_token,
      p_installation_id: claimArgs.p_installation_id,
      p_refresh_token_ciphertext: "refresh-ciphertext",
      p_refresh_token_expires_at: "2026-08-19T10:00:00.000Z",
      p_refresh_token_iv: "refresh-iv",
      p_refresh_token_key_version: "v2",
      p_refresh_token_tag: "refresh-tag",
    };
    const failArgs: DouyinFunctions["fail_douyin_authorizer_token_refresh"]["Args"] = {
      p_claim_token: claimReturn.claim_token,
      p_installation_id: claimArgs.p_installation_id,
      p_last_refresh_error_code: "DOUYIN_AUTHORIZER_REFRESH_FAILED",
    };
    const completeReturns: DouyinFunctions["complete_douyin_authorizer_token_refresh"]["Returns"] = true;
    const failReturns: DouyinFunctions["fail_douyin_authorizer_token_refresh"]["Returns"] = true;

    expect([
      claimArgs.p_installation_id,
      forceClaimArgs.p_expected_access_token_ciphertext,
      claimReturn.claim_expires_at,
      completeArgs.p_access_token_key_version,
      completeArgs.p_refresh_token_key_version,
      failArgs.p_last_refresh_error_code,
      completeReturns,
      failReturns,
    ]).toHaveLength(8);
  });
});

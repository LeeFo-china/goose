import { describe, expect, test } from "bun:test";

import type { Database } from "./database";
import type { Inserts, Tables, Updates } from "./db";

type DouyinFunctions = Database["public"]["Functions"];

describe("douyin miniapp database types", () => {
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
      installationInsert.authorizer_appid,
      installationUpdate.runtime_config,
    ];

    expect(fields).toHaveLength(16);
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
      claimReturn.claim_expires_at,
      completeArgs.p_access_token_key_version,
      completeArgs.p_refresh_token_key_version,
      failArgs.p_last_refresh_error_code,
      completeReturns,
      failReturns,
    ]).toHaveLength(7);
  });
});

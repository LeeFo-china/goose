import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("platform operator command idempotency contract", () => {
  test("scopes idempotency by actor, action and key", () => {
    const foundation = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260805180000_create_platform_operator_rbac_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const commands = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260805183000_create_platform_operator_commands.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(foundation).toContain(
      "ON public.platform_audit_logs(actor_user_id, action, idempotency_key)",
    );
    expect(commands).toContain("p_action text");
    expect(commands).toContain("AND audit_log.action = p_action");
    expect(commands).toContain("ON CONFLICT (actor_user_id, action, idempotency_key)");
    expect(commands).toContain(
      "get_platform_command_idempotent_result(p_actor_user_id, p_idempotency_key, 'platform_operator_create')",
    );
    expect(commands).toContain(
      "get_platform_command_idempotent_result(p_actor_user_id, p_idempotency_key, 'platform_role_create')",
    );
    expect(commands).not.toContain(
      "get_platform_command_idempotent_result(p_actor_user_id, p_idempotency_key);",
    );
  });
});

import { describe, expect, test } from "bun:test";

const migrationsDirectory = new URL("../../../../supabase/migrations/", import.meta.url);

const normalizeSql = (sql: string) =>
  sql.replaceAll(/--.*$/gm, " ").replaceAll(/\s+/g, " ").trim().toLowerCase();

async function migrationText() {
  const glob = new Bun.Glob("*_create_platform_service_trials.sql");
  const names = await Array.fromAsync(glob.scan({
    cwd: migrationsDirectory.pathname,
    onlyFiles: true,
  }));
  const name = names.sort().at(-1);
  return name ? Bun.file(new URL(name, migrationsDirectory)).text() : "";
}

function functionBody(sql: string, name: string) {
  const definition = sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ))?.[0] ?? "";
  const start = definition.indexOf("\nAS $$\n");
  const end = definition.lastIndexOf("\n$$;");
  return normalizeSql(start < 0 || end < 0 ? "" : definition.slice(start, end));
}

describe("platform service trial migration security follow-up", () => {
  test("rejects nullable command guards before mutation", async () => {
    const sql = await migrationText();
    const apply = functionBody(sql, "platform_service_trial_apply");
    for (const input of [
      "p_expected_user_count is null",
      "p_expected_project_count is null",
      "p_contact_phone is null",
    ]) expect(apply).toContain(input);

    const review = functionBody(sql, "platform_service_trial_review");
    expect(review).toContain("p_decision is null or p_decision not in ('approved', 'rejected')");
    expect(review).toContain("p_trial_type is null or p_trial_type not in ('standard', 'guided')");
    expect(functionBody(sql, "platform_service_trial_grant")).toContain(
      "p_trial_type is null or p_trial_type not in ('standard', 'guided')",
    );
    expect(functionBody(sql, "platform_service_trial_extend")).toContain(
      "p_extension_days is null",
    );
    expect(functionBody(sql, "platform_service_create_pending_order")).toContain(
      "p_required_channel is null",
    );
    expect(functionBody(sql, "platform_service_confirm_payment")).toContain(
      "p_paid_amount_fen is null",
    );

    const policy = functionBody(sql, "platform_service_trial_update_policy");
    for (const value of [
      "v_trial_days", "v_grace_days", "v_max_trial_days", "v_max_grace_days",
      "v_max_schedule_days", "v_max_extension_count", "v_max_extension_days",
      "v_reapply_cooldown_days", "v_allow_repeat",
    ]) expect(policy).toContain(`${value} is null`);
  });

  test("locks active RBAC facts and enforces the approved permission matrix", async () => {
    const sql = await migrationText();
    const tenantHelper = functionBody(sql, "platform_service_trial_lock_tenant_actor");
    const platformHelper = functionBody(sql, "platform_service_trial_lock_platform_actor");
    for (const helper of [tenantHelper, platformHelper]) {
      const roleSnapshot = helper.indexOf("into v_snapshot_role_ids");
      const roles = helper.indexOf("from public.roles", roleSnapshot);
      const employee = helper.indexOf("from public.employees", roles);
      const membershipRecheck = helper.indexOf("into v_current_role_ids", employee);
      const rolePermissions = helper.indexOf("from public.role_permissions", membershipRecheck);
      const overrides = helper.indexOf("from public.employee_permission_overrides", rolePermissions);
      const permissions = helper.indexOf("from public.permissions", overrides);
      expect(roleSnapshot).toBeGreaterThan(-1);
      expect(roles).toBeGreaterThan(roleSnapshot);
      expect(employee).toBeGreaterThan(roles);
      expect(membershipRecheck).toBeGreaterThan(employee);
      expect(rolePermissions).toBeGreaterThan(membershipRecheck);
      expect(overrides).toBeGreaterThan(rolePermissions);
      expect(permissions).toBeGreaterThan(overrides);
      expect(helper.match(/for share/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
      expect(helper).toContain("employee.status = 'active'");
      expect(helper).toContain("role.status = 'active'");
      expect(helper).toContain("v_current_role_ids is distinct from v_snapshot_role_ids");
      expect(helper).toContain("locked.access_scope = 'all'");
      expect(helper).toContain("permission.status = 'active'");
      expect(helper).toContain("cardinality(p_required_permission_codes)");
      expect(helper).toContain("service_trial_action_not_allowed");
    }

    for (const name of ["platform_service_trial_apply", "platform_service_trial_withdraw"]) {
      expect(functionBody(sql, name)).toContain("billing.service_trial.apply");
    }
    const review = functionBody(sql, "platform_service_trial_review");
    for (const permission of [
      "platform.service_trial.review", "platform.service_trial.manage",
      "platform.service_trial.override",
    ]) expect(review).toContain(permission);
    expect(review).toContain(
      "case when p_trial_type = 'guided' or p_assignee_employee_id is not null",
    );
    expect(review).toContain("v_override_needed and not p_allow_override");
    expect(review).toContain(
      "v_replay->'trial_snapshot'->'policy_snapshot'->'override_used'",
    );
    const reviewHash = review.slice(
      review.indexOf('v_request_hash :='), review.indexOf('select tenant_id'),
    );
    expect(reviewHash).not.toContain('allow_override');
    const grant = functionBody(sql, "platform_service_trial_grant");
    expect(grant).toContain("platform.service_trial.manage");
    expect(grant).toContain("v_override_needed and not p_allow_override");
    expect(grant).toContain(
      "v_replay->'trial_snapshot'->'policy_snapshot'->'override_used'",
    );
    const grantHash = grant.slice(
      grant.indexOf('v_request_hash :='),
      grant.indexOf('perform public.platform_service_trial_lock_platform_actor'),
    );
    expect(grantHash).not.toContain('allow_override');
    expect(functionBody(sql, "platform_service_trial_assign"))
      .toContain("platform.service_trial.manage");
    for (const name of [
      "platform_service_trial_extend", "platform_service_trial_revoke",
      "platform_service_trial_update_policy",
    ]) {
      const body = functionBody(sql, name);
      expect(body).toContain("platform.service_trial.manage");
      expect(body).toContain("platform.service_trial.override");
    }
  });

  test("applies active all-scope employee overrides with explicit deny precedence", async () => {
    const sql = await migrationText();
    for (const name of [
      "platform_service_trial_lock_tenant_actor",
      "platform_service_trial_lock_platform_actor",
    ]) {
      const helper = functionBody(sql, name);
      expect(helper).toContain("locked.effect = 'deny'");
      expect(helper).toContain("locked.effect = 'allow'");
      expect(helper).toContain("locked.access_scope = 'all'");
      expect(helper).toContain("v_denied_permission_ids");
      expect(helper).toContain("v_allowed_permission_ids");
      expect(helper).toContain("not (locked.id = any(v_denied_permission_ids))");
      expect(helper).toContain("locked.id = any(v_role_permission_ids)");
      expect(helper).toContain("locked.id = any(v_allowed_permission_ids)");
    }
  });

  test("rechecks saved override facts while ordinary replays bypass changed policy", async () => {
    const sql = await migrationText();
    for (const name of [
      "platform_service_trial_review", "platform_service_trial_grant",
    ]) {
      const body = functionBody(sql, name);
      const replay = body.indexOf("if v_replay is not null then");
      const policy = body.indexOf("from public.platform_service_trial_policies");
      const replayGuard = body.slice(replay, body.indexOf("return v_replay", replay));
      expect(replay).toBeGreaterThan(0);
      expect(replay).toBeLessThan(policy);
      expect(replayGuard).toContain(
        "policy_snapshot'->'override_used') = 'true'::jsonb",
      );
      expect(replayGuard).toContain("if not p_allow_override");
      expect(replayGuard).toContain("platform.service_trial.override");
      expect(replayGuard).toContain("platform_service_trial_lock_platform_actor");
    }
  });

  test("takes source and unsourced payment locks in one canonical order", async () => {
    const payment = functionBody(await migrationText(), "platform_service_confirm_payment");
    const snapshot = payment.indexOf("into v_order_snapshot");
    const enterprise = payment.indexOf("service-trial-enterprise:", snapshot);
    const tenant = payment.indexOf("service-trial-tenant:", snapshot);
    const trialLock = payment.indexOf("for update", tenant);
    const orderLock = payment.indexOf("into v_order from public.tenant_service_orders", trialLock);
    expect(snapshot).toBeGreaterThan(-1);
    expect(enterprise).toBeGreaterThan(snapshot);
    expect(tenant).toBeGreaterThan(enterprise);
    expect(trialLock).toBeGreaterThan(tenant);
    expect(orderLock).toBeGreaterThan(trialLock);
    expect(payment).toContain("v_order.tenant_id is distinct from v_order_snapshot.tenant_id");
    expect(payment).toContain("v_order.source_trial_id is distinct from v_order_snapshot.source_trial_id");
    const paidUpdate = payment.indexOf("update public.tenant_service_orders");
    expect(paidUpdate).toBeLessThan(payment.indexOf("conversion_anomaly", paidUpdate));
  });

  test("adds the three approved trial queue indexes without dropping existing indexes", async () => {
    const sql = normalizeSql(await migrationText());
    expect(sql).toContain(
      "create index tenant_service_trials_status_created_idx on public.tenant_service_trials (status, created_at desc, id desc)",
    );
    expect(sql).toContain(
      "create index tenant_service_trials_assignee_status_updated_idx on public.tenant_service_trials (assignee_employee_id, status, updated_at desc)",
    );
    expect(sql).toContain(
      "create index tenant_service_trials_grace_status_idx on public.tenant_service_trials (grace_ends_at, status)",
    );
    for (const existing of [
      "tenant_service_trials_tenant_created_idx",
      "tenant_service_trials_status_requested_idx",
      "tenant_service_trials_expiry_idx",
      "tenant_service_trials_activated_cohort_idx",
    ]) expect(sql).toContain(`create index ${existing}`);
  });
});

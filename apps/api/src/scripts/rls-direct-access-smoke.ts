import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const publishKey = requireEnv("SUPABASE_PUBLISH");

const sensitiveTables = [
  "employees",
  "customers",
  "projects",
  "payments",
  "finance_ledger_entries",
  "project_receivable_plans",
  "partner_commission_ledger",
  "platform_partner_members",
] as const;

const directRpcChecks = [
  {
    name: "find_auth_user_by_email",
    params: { p_email: "rls-smoke@example.invalid" },
  },
  {
    name: "get_employee_permission_context_fast",
    params: { p_employee_id: crypto.randomUUID() },
  },
  {
    name: "get_project_log_calendar",
    params: { project_uuid: crypto.randomUUID(), timezone_name: "Asia/Shanghai" },
  },
  {
    name: "list_employee_login_bindings",
    params: { p_employee_ids: [crypto.randomUUID()] },
  },
  {
    name: "list_visitor_picture_assets",
    params: { p_category_id: null, p_page: 1, p_page_size: 1 },
  },
] as const;

const client = createClient(supabaseUrl, publishKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  for (const table of sensitiveTables) {
    const { data, error, count } = await client
      .from(table)
      .select("id", { count: "exact" })
      .limit(1);

    if (error) {
      console.log(`${table}: blocked with ${error.code ?? "unknown_code"}`);
      continue;
    }

    const visibleRows = data?.length ?? 0;
    const visibleCount = count ?? 0;
    if (visibleRows > 0 || visibleCount > 0) {
      throw new Error(
        `${table}: publish-key direct access returned ${visibleRows} row(s), count=${visibleCount}`,
      );
    }

    console.log(`${table}: no rows visible to publish-key direct access`);
  }

  for (const check of directRpcChecks) {
    const { data, error } = await client.rpc(check.name, check.params);

    if (error) {
      console.log(`${check.name}: blocked with ${error.code ?? "unknown_code"}`);
      continue;
    }

    throw new Error(
      `${check.name}: publish-key direct RPC executed successfully: ${JSON.stringify(data)}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

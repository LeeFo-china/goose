import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`缺少环境变量: ${name}`);
  }

  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const supabasePublishKey = requireEnv("SUPABASE_PUBLISH");
const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

export class SupabaseDB {
  private static client = createClient(supabaseUrl, supabasePublishKey);

  private static adminClient = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  static from(table: string) {
    return this.client.from(table);
  }

  static getClient() {
    return this.client;
  }

  static getAdminClient() {
    return this.adminClient;
  }
}


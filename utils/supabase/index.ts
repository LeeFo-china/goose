// import { createClient } from "@supabase/supabase-js";

// export class SupabaseDB {
//   private static instance = createClient(
//     process.env.SUPABASE_URL!,
//     process.env.SUPABASE_PUBLISH!,
//   );

//   static getClient() {
//     return this.instance;
//   }
// }

import { createClient } from "@supabase/supabase-js";

export class SupabaseDB {
  private static client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISH!,
  );

  private static adminClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISH!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
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



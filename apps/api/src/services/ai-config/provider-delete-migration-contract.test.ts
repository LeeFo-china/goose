import { expect, test } from "bun:test";

test("provider model FK migration is transactional, bounded and only replaces cascade with restrict", async () => {
  const file = Bun.file(new URL("../../../../../supabase/migrations/20260911140000_restrict_ai_provider_model_delete.sql", import.meta.url));
  expect(await file.exists()).toBe(true);
  const sql = (await file.text()).replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  expect(sql).toBe("begin; set local lock_timeout = '5s'; set local statement_timeout = '60s'; alter table public.ai_models drop constraint ai_models_provider_id_fkey; alter table public.ai_models add constraint ai_models_provider_id_fkey foreign key (provider_id) references public.ai_providers(id) on delete restrict; commit;");
});

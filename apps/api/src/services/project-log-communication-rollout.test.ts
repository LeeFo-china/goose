import { expect, test } from "bun:test";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
test("new communication defaults closed; retirement is independent and explicit", async () => {
  const { ProjectLogCommunicationRollout } = await import("./project-log-communication-rollout");
  const defaults = new ProjectLogCommunicationRollout(async (_key, fallback) => fallback);
  await expect(defaults.assertProjectAvailable()).rejects.toMatchObject({ code: "COMMENT_COMMUNICATION_DISABLED" });
  await defaults.assertInternalAvailable();
  const cutover = new ProjectLogCommunicationRollout(async () => true);
  await cutover.assertProjectAvailable();
  await expect(cutover.assertInternalAvailable()).rejects.toMatchObject({ statusCode: 410, code: "PROJECT_LOG_INTERNAL_COMMENTS_RETIRED" });
});

import { expect, test } from "bun:test";
import { ProjectCommentV2CreateSchema, ProjectCommentV2QuerySchema, ProjectCommentPreviewSchema } from "./project-log-project-comments";
const id = "00000000-0000-4000-8000-000000000001";
const body = { contract_version: 2, client_request_id: id, content: "", attachment_ids: [id] };
test("image-only comments/replies valid, empty, duplicates, remote URLs, forged fields rejected", () => {
  expect(ProjectCommentV2CreateSchema.safeParse(body).success).toBe(true);
  expect(ProjectCommentV2CreateSchema.safeParse({...body,parent_id:id}).success).toBe(true);
  for (const patch of [{attachment_ids:[]},{attachment_ids:[id,id]},{attachment_ids:["https://example.com/a.jpg"]},{published:true},{content:"字".repeat(501)}]) {
    expect(ProjectCommentV2CreateSchema.safeParse({...body,...patch}).success).toBe(false);
  }
});
test("bounded preview and cursor pagination", () => {
  expect(ProjectCommentV2QuerySchema.parse({contract_version:2})).toMatchObject({pageSize:20});
  expect(ProjectCommentV2QuerySchema.safeParse({contract_version:2,pageSize:101}).success).toBe(false);
  expect(ProjectCommentPreviewSchema.safeParse({contract_version:2,log_ids:[id]}).success).toBe(true);
  expect(ProjectCommentPreviewSchema.safeParse({contract_version:2,log_ids:[]}).success).toBe(false);
  expect(ProjectCommentPreviewSchema.safeParse({contract_version:2,log_ids:Array(21).fill(id)}).success).toBe(false);
});

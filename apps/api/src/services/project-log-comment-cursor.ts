import { z } from "zod";
import { Errors } from "@/errors/error-factory";

// Keep the original timestamptz text: JS Date truncates PostgreSQL microseconds.
const CursorSchema = z.object({
  v: z.literal(2),
  logId: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
}).strict();

export interface ProjectCommentPosition {
  createdAt: string;
  id: string;
}

export function encodeProjectCommentCursor(input: ProjectCommentPosition & { logId: string }): string {
  return Buffer.from(JSON.stringify({ v: 2, ...input })).toString("base64url");
}

export function decodeProjectCommentCursor(cursor: string, logId: string): ProjectCommentPosition {
  if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw Errors.badRequest("评论游标格式无效");
  }
  const bytes = Buffer.from(cursor, "base64url");
  if (bytes.toString("base64url") !== cursor) throw Errors.badRequest("评论游标格式无效");
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw Errors.badRequest("评论游标格式无效");
  }
  const parsed = CursorSchema.safeParse(value);
  if (!parsed.success || parsed.data.logId !== logId) {
    throw Errors.badRequest("评论游标无效或不属于当前日志");
  }
  return { createdAt: parsed.data.createdAt, id: parsed.data.id };
}

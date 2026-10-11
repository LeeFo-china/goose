import { expect, test } from "bun:test";
import { decodeProjectCommentCursor, encodeProjectCommentCursor } from "./project-log-comment-cursor";

const logId = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const createdAt = "2026-10-11T00:00:00.123456+00:00";

test("cursor preserves PostgreSQL microseconds and same-timestamp UUID tie breaker", () => {
  const cursor = encodeProjectCommentCursor({ logId, createdAt, id });
  expect(decodeProjectCommentCursor(cursor, logId)).toEqual({ createdAt, id });
  const nextId = "00000000-0000-4000-8000-000000000003";
  expect(encodeProjectCommentCursor({ logId, createdAt, id: nextId })).not.toBe(cursor);
  expect(encodeProjectCommentCursor({ logId, createdAt: createdAt.replace("123456", "123457"), id })).not.toBe(cursor);
});

test("rejects foreign-log, malformed, noncanonical and invalid date cursors", () => {
  const valid = encodeProjectCommentCursor({ logId, createdAt, id });
  expect(() => decodeProjectCommentCursor(valid, id)).toThrow();
  for (const cursor of ["", "!", valid + "=", "a".repeat(1025), Buffer.from("null").toString("base64url"),
    Buffer.from(JSON.stringify({ v: 2, logId, createdAt: "2026-02-30T00:00:00Z", id })).toString("base64url"),
    Buffer.from(JSON.stringify({ v: 2, logId, createdAt, id: "x),published.eq.false" })).toString("base64url")]) {
    expect(() => decodeProjectCommentCursor(cursor, logId)).toThrow();
  }
});

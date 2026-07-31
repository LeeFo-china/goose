import { describe, expect, test } from "bun:test";

import {
  SHORT_SHARE_COPY_MAX_DISPLAY_CHARS,
  countDisplayCharacters,
  getShareCopyLengthInstruction,
  isValidShortShareCopy,
  normalizeShareCopies,
} from "./share-copy-policy";

const mediumFallback = [
  { id: "copy_1", text: "中等长度兜底文案。" },
  { id: "copy_2", text: "中等长度备用文案。" },
  { id: "copy_3", text: "中等长度第三条文案。" },
];

describe("share copy policy", () => {
  test("short 提示词明确 48 字和完整句约束", () => {
    expect(getShareCopyLengthInstruction("short")).toContain("48");
    expect(getShareCopyLengthInstruction("short")).toContain("不得以省略号结尾");
    expect(getShareCopyLengthInstruction("medium")).not.toContain("48");
  });

  test("按 Unicode code point 统计中文和 emoji", () => {
    expect(countDisplayCharacters("装修🙂")).toBe(3);
  });

  test("short 接受 48 个展示字符并拒绝 49 个", () => {
    expect(isValidShortShareCopy("好".repeat(
      SHORT_SHARE_COPY_MAX_DISPLAY_CHARS,
    ))).toBe(true);
    expect(isValidShortShareCopy("好".repeat(
      SHORT_SHARE_COPY_MAX_DISPLAY_CHARS + 1,
    ))).toBe(false);
  });

  test.each(["还没说完…", "还没说完...", "还没说完……"]) (
    "short 拒绝尾部省略号：%s",
    (text) => {
      expect(isValidShortShareCopy(text)).toBe(false);
    },
  );

  test("short 过滤超长、残句和重复项后补齐三条完整文案", () => {
    const completeText = "水电施工按计划推进，现场细节也整理得很清楚。";
    const result = normalizeShareCopies([
      { id: "valid", text: completeText },
      { id: "long", text: "长".repeat(49) },
      { id: "ellipsis", text: "施工还在继续…" },
      { id: "duplicate", text: completeText },
    ], "short", mediumFallback);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: "valid", text: completeText });
    expect(result.every(({ text }) =>
      countDisplayCharacters(text) <= SHORT_SHARE_COPY_MAX_DISPLAY_CHARS
      && !/(?:\.\.\.|…+)$/.test(text))).toBe(true);
  });

  test("short 保留合规原文且不执行截断", () => {
    const text = "记录今天的新变化，家正在一步步接近期待中的样子。";
    expect(normalizeShareCopies([
      { id: "copy", text: `  ${text}  ` },
    ], "short", mediumFallback)[0]?.text).toBe(text);
  });

  test("medium 保持现有行为，不应用 48 字限制", () => {
    const over48CompleteText = `${"施工进度稳定，".repeat(9)}一切按计划进行。`;
    expect(countDisplayCharacters(over48CompleteText)).toBeGreaterThan(48);
    expect(normalizeShareCopies([
      { id: "medium", text: over48CompleteText },
    ], "medium", mediumFallback)).toEqual([
      { id: "medium", text: over48CompleteText },
    ]);
  });
});

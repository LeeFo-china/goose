import { describe, expect, test } from "bun:test";

import { ApiRequestError } from "../api/request";
import { copyTextToClipboard, type ClipboardSetter } from "./clipboard";

describe("Douyin clipboard adapter", () => {
  test("passes exact text to the installed callback API and resolves on success", async () => {
    const values: string[] = [];
    const setter: ClipboardSetter = (options) => {
      values.push(options.data);
      options.success?.({ errMsg: "setClipboardData:ok" });
    };

    await expect(copyTextToClipboard("第一行\n第二行", setter)).resolves.toBeUndefined();
    expect(values).toEqual(["第一行\n第二行"]);
  });

  test("normalizes native failure without exposing platform details", async () => {
    const setter: ClipboardSetter = (options) => {
      options.fail?.({ errMsg: "permission denied", errNo: 1001 });
    };

    await expect(copyTextToClipboard("正文", setter)).rejects.toEqual(
      new ApiRequestError(0, "CLIPBOARD_WRITE_FAILED", "复制失败，请稍后重试"),
    );
  });

  test("normalizes a synchronous platform throw as a clipboard failure", async () => {
    const setter: ClipboardSetter = () => {
      throw new Error("native bridge unavailable");
    };

    await expect(copyTextToClipboard("正文", setter)).rejects.toEqual(
      new ApiRequestError(0, "CLIPBOARD_WRITE_FAILED", "复制失败，请稍后重试"),
    );
  });

  test("honors only the first success, failure or throw settlement", async () => {
    const succeedsFirst: ClipboardSetter = (options) => {
      options.success?.({ errMsg: "setClipboardData:ok" });
      options.fail?.({ errMsg: "late fail" });
      throw new Error("late throw");
    };
    await expect(copyTextToClipboard("正文", succeedsFirst)).resolves.toBeUndefined();

    const failsFirst: ClipboardSetter = (options) => {
      options.fail?.({ errMsg: "setClipboardData:fail" });
      options.success?.({ errMsg: "late success" });
    };
    await expect(copyTextToClipboard("正文", failsFirst))
      .rejects.toMatchObject({ code: "CLIPBOARD_WRITE_FAILED" });
  });

  test("rejects empty or oversized clipboard input before invoking the platform", async () => {
    let callCount = 0;
    const setter: ClipboardSetter = () => { callCount += 1; };
    await expect(copyTextToClipboard("", setter))
      .rejects.toMatchObject({ code: "INVALID_CLIPBOARD_CONTENT" });
    await expect(copyTextToClipboard("x".repeat(512 * 1024 + 1), setter))
      .rejects.toMatchObject({ code: "INVALID_CLIPBOARD_CONTENT" });
    expect(callCount).toBe(0);
  });
});

import { describe, expect, test } from "bun:test";

import {
  canUseRequisitionHydration,
  createRequisitionRequestAuthority,
  isAbortError,
} from "./requisition-request-authority";

describe("采购申请请求竞态控制", () => {
  test("新请求取消旧请求且迟到响应不再拥有写入权限", () => {
    const authority = createRequisitionRequestAuthority();
    const first = authority.begin();
    const second = authority.begin();

    expect(first.controller.signal.aborted).toBe(true);
    expect(authority.isCurrent(first)).toBe(false);
    expect(authority.isCurrent(second)).toBe(true);

    authority.invalidate();
    expect(second.controller.signal.aborted).toBe(true);
    expect(authority.isCurrent(second)).toBe(false);
  });

  test("只识别浏览器 AbortError 而不吞掉普通请求失败", () => {
    expect(isAbortError(new DOMException("cancelled", "AbortError")))
      .toBe(true);
    expect(isAbortError(new Error("network failed"))).toBe(false);
  });

  test("仅允许当前请求记录的成功水合状态进入编辑和保存", () => {
    expect(canUseRequisitionHydration("record-b", "record-a", false))
      .toBe(false);
    expect(canUseRequisitionHydration("record-b", "record-b", true))
      .toBe(false);
    expect(canUseRequisitionHydration("record-b", "record-b", false))
      .toBe(true);
    expect(canUseRequisitionHydration(null, null, false)).toBe(true);
  });
});

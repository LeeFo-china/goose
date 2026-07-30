import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { refreshRequisitionAfterCommand } from "./requisition-command-refresh";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("采购申请命令成功后的刷新边界", () => {
  test("刷新失败被转成显式结果而不是重新抛入命令失败分支", async () => {
    const refreshError = new Error("GET failed");
    const failure = await refreshRequisitionAfterCommand(async () => {
      throw refreshError;
    });
    expect(failure).toEqual({
      status: "refresh_failed",
      error: refreshError,
    });

    const success = await refreshRequisitionAfterCommand(async () => "latest");
    expect(success).toEqual({ status: "refreshed", value: "latest" });
  });

  test("编辑器先提交命令结果再独立刷新且刷新失败不保留重试身份", () => {
    const editor = readSource("./requisition-editor.tsx");
    const save = readSource("./use-requisition-draft-save.ts");
    const cleared = save.indexOf("setAttempt(null)");
    const refreshed = save.indexOf("await refreshSavedDraft");

    expect(save).toContain("commandResult.requisition");
    expect(save.match(/commandResult = await/g)?.length).toBe(2);
    expect(save).toContain("onCommandAccepted(commandResult.requisition)");
    expect(editor).toContain("setEditingId(requisition.id)");
    expect(editor).toContain("setExpectedVersion(requisition.version)");
    expect(editor).toContain("setSavedRecord(requisition)");
    expect(editor).toContain("onSaved(requisition)");
    expect(editor).toContain("const recordId = record?.id ?? null");
    expect(editor).toContain("}, [applyLoadedDraft, recordId])");
    expect(editor).toContain(
      "if (recordId && recordId === activeDraftId.current) return",
    );
    expect(save).toContain("setRefreshRequired(true)");
    expect(save).toContain(
      "草稿已成功保存，但最新数据刷新失败，请手动刷新。",
    );
    expect(editor).toContain("刷新最新数据");
    expect(cleared).toBeGreaterThan(-1);
    expect(cleared).toBeLessThan(refreshed);
    expect(save.indexOf("采购申请草稿保存失败")).toBeLessThan(cleared);
    expect(save.indexOf('toast.success("采购申请草稿已保存")'))
      .toBeLessThan(refreshed);
  });

  test("详情先采用四类命令结果再刷新并按记录 ID 稳定资源身份", () => {
    const detail = readSource("./requisition-detail.tsx");
    const commandFlow = detail.slice(
      detail.indexOf("async function runCommand"),
      detail.indexOf("async function refreshLatest"),
    );
    const cleared = commandFlow.indexOf("setAttempt(null)");
    const refreshed = commandFlow.indexOf("const latest = await reload");

    expect(detail).toContain("commandResult.requisition");
    expect(detail.match(/commandResult = await/g)?.length).toBe(4);
    expect(detail).toContain("onChanged(commandResult.requisition)");
    expect(detail).toContain("setConfirmOpen(false)");
    expect(detail).toContain(
      "操作已成功，但最新详情刷新失败，请手动刷新。",
    );
    expect(detail).toContain("const recordId = record?.id ?? null");
    expect(detail).toContain("const recordRef = useRef(record)");
    expect(detail).toContain("[open, recordId, reload]");
    expect(cleared).toBeGreaterThan(-1);
    expect(cleared).toBeLessThan(refreshed);
    expect(commandFlow.indexOf("采购申请操作失败")).toBeLessThan(cleared);
    expect(commandFlow.indexOf("toast.success")).toBeLessThan(refreshed);

    const refreshFailure = detail.slice(
      detail.indexOf('if (refreshed.status === "refresh_failed")'),
      detail.indexOf("const [nextDetail, itemPage]"),
    );
    expect(refreshFailure).not.toContain("setDetail(");
    expect(refreshFailure).not.toContain("setItems(");
  });

  test("数量错误只标记对应行并关联唯一的无障碍说明", () => {
    const lines = readSource("./requisition-editor-lines.tsx");

    expect(lines).toContain("isValidRequisitionQuantity(line.quantity)");
    expect(lines).toContain("aria-invalid={quantityInvalid}");
    expect(lines).toContain("aria-describedby={");
    expect(lines).toContain('className="sr-only"');
    expect(lines).toContain("requisition-quantity-error-");
    expect(lines).not.toContain("aria-invalid={Boolean(error)}");
  });
});

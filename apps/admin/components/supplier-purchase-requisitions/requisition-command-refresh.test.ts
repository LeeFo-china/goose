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
    const editorParts = readSource("./requisition-editor-parts.tsx");
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
    expect(editor).toContain("applyLoadedDraft");
    expect(editor).toContain("recordId");
    expect(editor).toContain(
      "if (recordId && recordId === activeDraftId.current) return",
    );
    expect(save).toContain("setRefreshRequired(true)");
    expect(save).toContain("草稿已成功保存，但最新数据刷新失败，请手动刷新。");
    expect(editorParts).toContain("刷新最新数据");
    expect(cleared).toBeGreaterThan(-1);
    expect(cleared).toBeLessThan(refreshed);
    expect(save.indexOf("采购申请草稿保存失败")).toBeLessThan(cleared);
    expect(save.indexOf('toast.success("采购申请草稿已保存")')).toBeLessThan(
      refreshed,
    );
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
    expect(detail).toContain("操作已成功，但最新详情刷新失败，请手动刷新。");
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
    expect(lines).toContain("quantity-error");
    expect(lines).toContain("REQUISITION_QUANTITY_ERROR");
    expect(lines).not.toContain("aria-invalid={Boolean(error)}");
    expect(lines).not.toContain("<Field data-invalid={Boolean(error)}>");
    expect(lines).toContain('role="alert"');
    expect(lines).toContain("productLabel");
  });

  test("草稿和目录请求分别取消旧请求且继续用版本号隔离迟到响应", () => {
    const editor = readSource("./requisition-editor.tsx");
    const authority = readSource("./requisition-request-authority.ts");
    const catalog = readSource("./use-requisition-catalog.ts");

    expect(authority).toContain("new AbortController()");
    expect(authority).toContain("current?.controller.abort()");
    expect(editor).toContain("draftRequests.invalidate()");
    expect(editor).toContain("abortCatalog()");
    expect(editor + catalog).toContain("request.controller.signal");
    expect(editor).toContain("draftRequestVersion.current !== version");
    expect(catalog).toContain("requestVersion.current !== version");
    expect(editor + catalog).toContain("isAbortError(caught)");
  });

  test("目录错误与保存命令错误分离并在新查询前清理", () => {
    const editor = readSource("./requisition-editor.tsx");
    const workbench = readSource("./requisition-editor-workbench.tsx");
    const catalog = readSource("./use-requisition-catalog.ts");

    expect(catalog).toContain("const [error, setError]");
    expect(catalog).toContain("setError(null)");
    expect(catalog).toContain("setError(errorMessage(caught");
    expect(workbench).toContain("catalogError={catalogError}");
    expect(workbench).toContain("onRetry={onRetryCatalog}");
  });

  test("详情统一展示采购用途且不再使用临时采购原因文案", () => {
    const detailContent = readSource("./requisition-detail-content.tsx");

    expect(detailContent).toContain('label="采购用途"');
    expect(detailContent).not.toContain("临时采购原因");
  });

  test("切换记录先撤销旧水合身份且加载失败时锁住保存并提供重试", () => {
    const editor = readSource("./requisition-editor.tsx");
    const save = readSource("./use-requisition-draft-save.ts");
    const parts = readSource("./requisition-editor-parts.tsx");

    expect(editor).toContain("setDraftLoadFailed(false)");
    expect(editor).toContain("clearHydratedDraft()");
    expect(editor).toContain("setDraftLoadFailed(true)");
    expect(editor).toContain("canUseRequisitionHydration(");
    expect(save).toContain("!draftReady");
    expect(parts).toContain("重新加载采购申请");
  });

  test("目录新查询先移除旧商品且失败后关闭提示不会恢复旧页", () => {
    const catalog = readSource("./use-requisition-catalog.ts");
    const clearAt = catalog.indexOf("setCatalog(emptyRequisitionCatalog)",
      catalog.indexOf("const request = requests.begin()"));
    const requestAt = catalog.indexOf("await loadRequisitionCatalog");

    expect(clearAt).toBeGreaterThan(-1);
    expect(clearAt).toBeLessThan(requestAt);
    expect(catalog).toContain("dismissError: () => setError(null)");
  });

  test("草稿刷新GET独立取消且不向mutation注入signal或改变幂等重试", () => {
    const save = readSource("./use-requisition-draft-save.ts");
    const refreshStart = save.indexOf("async function refreshSavedDraft");
    const saveStart = save.indexOf("async function saveDraft");
    const refreshFlow = save.slice(refreshStart, saveStart);
    const mutationFlow = save.slice(saveStart);

    expect(save).toContain("refreshRequests.begin()");
    expect(save).toContain("refreshRequests.invalidate()");
    expect(refreshFlow).toContain("request.controller.signal");
    expect(refreshFlow).toContain("isAbortError(refreshed.error)");
    expect(mutationFlow).not.toContain("request.controller.signal");
    expect(mutationFlow).toContain("resolveSupplierCommandAttempt(attempt");
    expect(mutationFlow).toContain(
      "refreshGeneration.current === refreshGenerationAtCommandStart",
    );
  });
});

import { existsSync } from "node:fs";
import { describe, expect, test } from "bun:test";

async function implementation() {
  expect(existsSync(new URL("./use-ai-provider-models.ts", import.meta.url))).toBe(true);
  return import("./use-ai-provider-models");
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("provider-scoped model state", () => {
  test("confirmed model saves reset pagination and errors while refreshing the list", async () => {
    const { initialModelState, modelStateReducer } = await implementation();
    const state = { ...initialModelState("one"), page: 2, saving: true, saveError: "old", revision: 3 };
    const saved = modelStateReducer(state, { type: "saved" });
    expect(saved.page).toBe(1);
    expect(saved.revision).toBe(4);
    expect(saved.saving).toBe(false);
    expect(saved.form).toBeNull();
    expect(saved.saveError).toBe("");
  });
  test("loading whitespace-only filter edits preserve query revision and current page", async () => {
    const { initialModelState, modelStateReducer, modelQueryPath } = await implementation();
    const loading = { ...initialModelState("one"), keyword: "gpt", page: 3, loading: true };
    const displayEdit = modelStateReducer(loading, { type: "filter", keyword: "gpt " });
    expect(displayEdit.keyword).toBe("gpt ");
    expect(displayEdit.page).toBe(3);
    expect(displayEdit.revision).toBe(loading.revision);
    expect(modelQueryPath(displayEdit)).toBe(modelQueryPath(loading));
  });
  test("real filter changes always schedule a new query even when edits return to the old URL", async () => {
    const { initialModelState, modelStateReducer } = await implementation();
    const initial = { ...initialModelState("one"), keyword: "gpt", page: 3 };
    const changed = modelStateReducer(initial, { type: "filter", keyword: "claude" });
    const returned = modelStateReducer(changed, { type: "filter", keyword: "gpt" });
    expect(changed.page).toBe(1);
    expect(changed.revision).toBe(initial.revision + 1);
    expect(returned.revision).toBe(changed.revision + 1);
  });
  test("switching providers resets page, filters and dialog selection", async () => {
    const { initialModelState, modelStateReducer } = await implementation();
    const state = { ...initialModelState("one"), page: 4, keyword: "old", modality: "image" as const,
      status: "inactive" as const, form: { provider_id: "one", id: "old-model", name: "旧模型", model_name: "old",
        modality: "text" as const, input_modalities: ["text" as const], status: "active" as const, sort_order: "0" }, error: "old error" };
    expect(modelStateReducer(state, { type: "provider", providerId: "two" })).toEqual(initialModelState("two"));
  });
  test("rapid filters reset page and keep requests bounded and supplier scoped", async () => {
    const { initialModelState, modelStateReducer, modelQueryPath } = await implementation();
    const state = modelStateReducer({ ...initialModelState("one"), page: 4 }, { type: "filter", keyword: "design", modality: "image" });
    expect(state.page).toBe(1);
    const url = new URL(modelQueryPath(state), "https://local.test");
    expect(url.searchParams.get("providerId")).toBe("one");
    expect(url.searchParams.get("keyword")).toBe("design");
    expect(url.searchParams.get("modality")).toBe("image");
    expect(Number(url.searchParams.get("pageSize"))).toBeLessThanOrEqual(100);
  });
  test("late supplier and filter responses cannot overwrite current results", async () => {
    const { createModelRequestScope } = await implementation();
    const scope = createModelRequestScope();
    const old = deferred<string>();
    const current = deferred<string>();
    const values: string[] = [];
    let oldSignal: AbortSignal | undefined;
    const first = scope.run((signal) => { oldSignal = signal; return old.promise; }, (value) => values.push(value), () => undefined);
    const second = scope.run(() => current.promise, (value) => values.push(value), () => undefined);
    current.resolve("new supplier"); await second;
    old.resolve("old supplier"); await first;
    expect(oldSignal?.aborted).toBe(true);
    expect(values).toEqual(["new supplier"]);
  });
  test("unmount invalidates pending success and failure callbacks", async () => {
    const { createModelRequestScope } = await implementation();
    const scope = createModelRequestScope();
    const pending = deferred<string>();
    const values: string[] = [];
    const request = scope.run(() => pending.promise, (value) => values.push(value), () => values.push("error"));
    scope.invalidate(); pending.resolve("late"); await request;
    expect(values).toEqual([]);
    const rejection = deferred<string>();
    const failedRequest = scope.run(async () => { await rejection.promise; throw new Error("late failure"); }, (value) => values.push(value), () => values.push("error"));
    scope.invalidate(); rejection.resolve("finish"); await failedRequest;
    expect(values).toEqual([]);
  });
});

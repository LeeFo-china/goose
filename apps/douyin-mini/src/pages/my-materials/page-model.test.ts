import { describe, expect, test } from "bun:test";

import type { DouyinMaterialNoteOwnedSummary } from "../../models";
import {
  beginOwnedListLoad,
  beginOwnedMutation,
  cancelOwnedMutation,
  createOwnedMaterialPageState,
  resolveOwnedListLoad,
  resolveOwnedMutation,
} from "./page-model";

const CLAIM_ID = "22222222-2222-4222-8222-222222222222";
const item: DouyinMaterialNoteOwnedSummary = {
  claim_id: CLAIM_ID,
  id: "11111111-1111-4111-8111-111111111111",
  version: 1,
  title: "开工清单",
  summary: "开工前逐项确认",
  category: "施工避坑",
  applicable_to: "准备开工的业主",
  claimed_at: "2026-09-01T08:30:00.000Z",
};

describe("my materials page model", () => {
  test("paginates owned claims and keeps claim navigation separate from note re-claim", () => {
    const pending = beginOwnedListLoad(createOwnedMaterialPageState(20), "loadMore")!;
    const ready = resolveOwnedListLoad(pending.state, pending.request, {
      list: [item],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(ready.pagination.items).toEqual([item]);
    expect(ready.navigationFor(item)).toEqual({ kind: "owned", claimId: CLAIM_ID });
    expect(ready.reclaimNavigationFor(item)).toEqual({ kind: "preview", id: item.id });
  });

  test("single remove is single-flight and successful mutation requires a reload", () => {
    const state = createOwnedMaterialPageState();
    const pending = beginOwnedMutation(state, { type: "remove", claimId: CLAIM_ID });
    expect(pending).not.toBeNull();
    if (!pending) return;
    expect(beginOwnedMutation(pending.state, { type: "remove", claimId: CLAIM_ID }))
      .toBeNull();
    expect(resolveOwnedMutation(pending.state, pending.request)).toMatchObject({
      shouldReload: true,
      state: { mutation: null },
    });
  });

  test("clear all is one atomic command and never expands into per-item removals", () => {
    const state = createOwnedMaterialPageState();
    const pending = beginOwnedMutation(state, { type: "clear" });
    expect(pending?.request.command).toEqual({ type: "clear" });
    expect(pending?.request.command).not.toHaveProperty("claimIds");
    expect(beginOwnedMutation(pending!.state, { type: "clear" })).toBeNull();
    expect(resolveOwnedMutation(pending!.state, pending!.request).shouldReload).toBe(true);
  });

  test("hide cancels mutation authority so a late result cannot request reload", () => {
    const pending = beginOwnedMutation(
      createOwnedMaterialPageState(),
      { type: "remove", claimId: CLAIM_ID },
    )!;
    const hidden = cancelOwnedMutation(pending.state);
    expect(hidden.mutation).toBeNull();
    expect(resolveOwnedMutation(hidden, pending.request)).toEqual({
      state: hidden,
      shouldReload: false,
    });
  });
});

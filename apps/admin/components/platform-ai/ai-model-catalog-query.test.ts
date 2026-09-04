import { describe, expect, test } from "bun:test";
import {
  buildCatalogEntriesPath,
  catalogFiltersEqual,
  defaultCatalogEntryFilters,
  filterApplicableCatalogEntryIds,
  nextCatalogEntryPage,
  shouldLoadCatalogEntriesOnMount,
  shouldResetCatalogEntryPage,
} from "./ai-model-catalog-query";

describe("ai model catalog query helpers", () => {
  test("omits blank and all filters while keeping pagination", () => {
    expect(buildCatalogEntriesPath("run-1", defaultCatalogEntryFilters(), 3)).toBe(
      "/platform/ai-config/catalog-runs/run-1/entries?page=3&pageSize=20",
    );
  });

  test("encodes keyword and includes modality and change filters", () => {
    expect(buildCatalogEntriesPath("run 1", {
      keyword: " openai/gpt,4 ",
      modality: "image",
      changeType: "changed",
    }, 2)).toBe(
      "/platform/ai-config/catalog-runs/run%201/entries?page=2&pageSize=20&keyword=openai%2Fgpt%2C4&modality=image&changeType=changed",
    );
  });

  test("resets pagination to first page when filters change", () => {
    const current = defaultCatalogEntryFilters();
    const next = { ...current, modality: "video" as const };

    expect(shouldResetCatalogEntryPage(current, next)).toBe(true);
    expect(nextCatalogEntryPage(4, current, next)).toBe(1);
    expect(catalogFiltersEqual(current, defaultCatalogEntryFilters())).toBe(true);
    expect(nextCatalogEntryPage(4, current, defaultCatalogEntryFilters())).toBe(4);
  });

  test("skips initial client reload when server entries already match the selected run", () => {
    const filters = defaultCatalogEntryFilters();

    expect(shouldLoadCatalogEntriesOnMount({
      selectedRunId: "run-1",
      firstEntryRunId: "run-1",
      filters,
    })).toBe(false);
    expect(shouldLoadCatalogEntriesOnMount({
      selectedRunId: "run-1",
      firstEntryRunId: "run-2",
      filters,
    })).toBe(true);
    expect(shouldLoadCatalogEntriesOnMount({
      selectedRunId: "run-1",
      firstEntryRunId: "run-1",
      filters: { ...filters, modality: "video" },
    })).toBe(true);
  });

  test("keeps only selected entries that are applicable in the current page", () => {
    expect(filterApplicableCatalogEntryIds(
      ["eligible-1", "blocked-1", "missing-1"],
      [
        { id: "eligible-1", apply_status: "eligible" },
        { id: "blocked-1", apply_status: "blocked" },
      ],
    )).toEqual(["eligible-1"]);
  });
});

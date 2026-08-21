import { initializeCatalogCreateIntent } from "./supplier-catalog-rules";
import type { CatalogCreateIntent } from "./supplier-catalog-types";

export function completeCatalogSpecCopy(
  result: unknown,
  keyFactory: () => string,
): { expectedVersion: number; intent: CatalogCreateIntent } {
  if (typeof result !== "object" || result === null) {
    throw new Error("复制结果缺少有效分类版本");
  }
  const version = (result as { version?: unknown }).version;
  if (!Number.isSafeInteger(version) || (version as number) < 1) {
    throw new Error("复制结果缺少有效分类版本");
  }
  return {
    expectedVersion: version as number,
    intent: initializeCatalogCreateIntent(keyFactory),
  };
}

export function createLatestCatalogSpecRequestSequence() {
  let current: AbortController | null = null;
  return {
    begin() {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      return {
        signal: controller.signal,
        isCurrent: () => current === controller,
        finish: () => {
          if (current === controller) current = null;
        },
      };
    },
    cancel() {
      current?.abort();
      current = null;
    },
  };
}

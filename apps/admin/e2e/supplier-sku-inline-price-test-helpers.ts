import { expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

export const mockBackendBaseUrl = "http://127.0.0.1:3996";
export const relationshipId = "23000000-0000-4000-8000-000000000021";
export const tenantProductId = "21000000-0000-4000-8000-000000000032";
export const tenantSkuId = "21000000-0000-4000-8000-000000000042";

export type ResetConfig = {
  sessionMode?: string;
  tenantProductStatus?: string;
  tenantSkuStatus?: string;
  priceScenario?: string;
  compositeConflictOnce?: boolean;
};

export type Mutation = {
  method: string;
  path: string;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
};

type LoggedRequest = { method: string; path: string; query: string };

export type MockState = {
  products: Array<{ id: string; status: string }>;
  skus: Array<{ id: string; name: string; status: string; version: number }>;
  priceLists: Array<{
    id: string;
    lifecycle_status: string;
    version_number: number;
    effective_from: string;
    effective_until: string | null;
    row_version: number;
  }>;
  items: Array<{
    id: string;
    supplier_price_list_id: string;
    supplier_sku_id: string;
    unit_price: string;
    tax_rate: string;
    tax_inclusive: boolean;
  }>;
};

type ExpectedHttpError = { status: number; path: string; count?: number };

export function monitorBrowser(page: Page, expectedHttpErrors: ExpectedHttpError[] = []) {
  const consoleErrors: Array<{ text: string; url: string }> = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push({ text: message.text(), url: message.location().url });
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return () => {
    const expectedIndexes = new Set<number>();
    for (const expectedError of expectedHttpErrors) {
      const matches = consoleErrors.flatMap((error, index) =>
        error.text.includes(`status of ${expectedError.status}`) &&
          error.url.includes(expectedError.path) ? [index] : []);
      expect(matches).toHaveLength(expectedError.count ?? 1);
      for (const index of matches) expectedIndexes.add(index);
    }
    expect(consoleErrors.filter((_, index) => !expectedIndexes.has(index))).toEqual([]);
    expect(pageErrors).toEqual([]);
  };
}

export async function resetMock(
  request: APIRequestContext,
  config: ResetConfig = {},
) {
  const response = await request.post(`${mockBackendBaseUrl}/__test/reset`, {
    data: config,
  });
  expect(response.ok()).toBe(true);
  expect(await readMutations(request)).toEqual([]);
}

export async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: "18637605353", code: "" },
  });
  expect(response.ok()).toBe(true);
}

export async function readMutations(
  request: APIRequestContext,
): Promise<Mutation[]> {
  const response = await request.get(`${mockBackendBaseUrl}/__test/mutations`);
  expect(response.ok()).toBe(true);
  return (await response.json() as { mutations: Mutation[] }).mutations;
}

export async function readRequests(
  request: APIRequestContext,
): Promise<LoggedRequest[]> {
  const response = await request.get(`${mockBackendBaseUrl}/__test/requests`);
  expect(response.ok()).toBe(true);
  return (await response.json() as { requests: LoggedRequest[] }).requests;
}

export async function readState(
  request: APIRequestContext,
): Promise<MockState> {
  const response = await request.get(`${mockBackendBaseUrl}/__test/state`);
  expect(response.ok()).toBe(true);
  return (await response.json() as { state: MockState }).state;
}

export function compositeMutations(mutations: Mutation[]) {
  return mutations.filter(({ path }) => path.includes("/purchasable-skus/"));
}

export function legacySkuMutations(mutations: Mutation[]) {
  return mutations.filter(({ path }) =>
    /^\/supplier-products\/[^/]+\/skus\/[^/]+$/.test(path));
}

export function skuPostMutations(mutations: Mutation[]) {
  return mutations.filter(({ method, path }) =>
    method === "POST" && (
      /^\/supplier-products\/[^/]+\/skus\/[^/]+$/.test(path) ||
      /^\/supplier-products\/[^/]+\/purchasable-skus\/[^/]+$/.test(path)
    ));
}

function isCostPricePath(path: string) {
  return path.includes("/purchasable-skus/") ||
    path === "/supplier-price-lists" ||
    path.startsWith("/supplier-price-lists/") ||
    path.includes("/supplier-price-list-items") ||
    path.includes("/price-list-items");
}

export async function expectNoPriceTraffic(request: APIRequestContext) {
  const requests = (await readRequests(request)).filter(({ path }) =>
    isCostPricePath(path));
  expect(requests.filter(({ method }) => method === "GET")).toEqual([]);
  expect(requests.filter(({ method }) => method !== "GET")).toEqual([]);
  expect((await readMutations(request)).filter(({ path }) =>
    isCostPricePath(path))).toEqual([]);
}

import { requestBackendJson } from "@/lib/backend-client";

import type {
  CatalogBaseUnit,
  CatalogPage,
} from "./supplier-catalog-types";
import {
  loadBaseUnitPageWith,
  type BaseUnitQuery,
  type BaseUnitRequest,
} from "./supplier-catalog-requests";

export function loadBaseUnitPage(
  input: BaseUnitQuery,
  request: BaseUnitRequest = (path) =>
    requestBackendJson<CatalogPage<CatalogBaseUnit>>(path, {
      fallbackMessage: "加载基准单位失败",
    }),
) {
  return loadBaseUnitPageWith(input, request);
}

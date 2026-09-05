import { requestBackendJson } from "@/lib/backend-client";

import {
  buildWarehouseListPath,
} from "./warehouse-rules";
import type {
  Warehouse,
  WarehouseCreateRequest,
  WarehousePage,
  WarehouseStatus,
  WarehouseUpdateRequest,
} from "./warehouse-types";

type IdFactory = () => string;

export function listWarehouses(input: {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: WarehouseStatus;
}) {
  return requestBackendJson<WarehousePage>(buildWarehouseListPath(input), {
    cache: "no-store",
    fallbackMessage: "仓库列表加载失败",
  });
}

export function createWarehouse(
  input: WarehouseCreateRequest,
  idFactory: IdFactory = () => crypto.randomUUID(),
  idempotencyKeyFactory: IdFactory = () => crypto.randomUUID(),
) {
  return requestBackendJson<Warehouse>("/warehouses", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKeyFactory() },
    body: JSON.stringify({
      id: idFactory(),
      ...input,
    }),
    fallbackMessage: "创建仓库失败",
  });
}

export function updateWarehouse(
  warehouseId: string,
  input: WarehouseUpdateRequest,
  idempotencyKeyFactory: IdFactory = () => crypto.randomUUID(),
) {
  return requestBackendJson<Warehouse>(
    `/warehouses/${encodeURIComponent(warehouseId)}`,
    {
      method: "PATCH",
      headers: { "Idempotency-Key": idempotencyKeyFactory() },
      body: JSON.stringify(input),
      fallbackMessage: "更新仓库失败",
    },
  );
}

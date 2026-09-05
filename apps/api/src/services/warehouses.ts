import { randomUUID } from "node:crypto";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import {
  warehousesRepository,
  type WarehouseRecord,
  type WarehouseUpdateCommand,
  type WarehousesRepository,
} from "@/repositories/warehouses";
import type {
  WarehouseCreateInput,
  WarehouseListQueryInput,
  WarehouseUpdateInput,
} from "@/schema/warehouses";
import type { AuthContext } from "@/services/authorization";
import { warehouseAccessService } from "@/services/warehouse-access";

type WarehouseRepositoryPort = Pick<
  WarehousesRepository,
  "list" | "findById" | "create" | "update"
>;
type WarehouseAccessPort = Pick<
  typeof warehouseAccessService,
  "requireRead" | "requireManage"
>;

export type WarehousesServiceDependencies = {
  repository?: WarehouseRepositoryPort;
  access?: WarehouseAccessPort;
  idFactory?: () => string;
};

export class WarehousesService {
  private readonly repository: WarehouseRepositoryPort;
  private readonly access: WarehouseAccessPort;
  private readonly idFactory: () => string;

  constructor(dependencies: WarehousesServiceDependencies = {}) {
    this.repository = dependencies.repository ?? warehousesRepository;
    this.access = dependencies.access ?? warehouseAccessService;
    this.idFactory = dependencies.idFactory ?? randomUUID;
  }

  list(auth: AuthContext, query: WarehouseListQueryInput) {
    const scope = this.access.requireRead(auth);
    return this.repository.list({
      tenant_id: scope.tenantId,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  async get(auth: AuthContext, warehouseId: string): Promise<WarehouseRecord> {
    const scope = this.access.requireRead(auth);
    const warehouse = await this.repository.findById(scope.tenantId, warehouseId);
    if (!warehouse) {
      throw Errors.business(404, "仓库不存在", "WAREHOUSE_NOT_FOUND");
    }
    return warehouse;
  }

  async create(
    auth: AuthContext,
    input: WarehouseCreateInput,
    idempotencyKey: string,
  ): Promise<WarehouseRecord> {
    const scope = this.access.requireManage(auth);
    return this.mapWarehouseCommandError(() =>
      this.repository.create({
        warehouse_id: input.id || this.idFactory(),
        tenant_id: scope.tenantId,
        name: input.name,
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.contact_name !== undefined
          ? { contact_name: input.contact_name }
          : {}),
        ...(input.contact_phone !== undefined
          ? { contact_phone: input.contact_phone }
          : {}),
        ...(input.manager_employee_id !== undefined
          ? { manager_employee_id: input.manager_employee_id }
          : {}),
        is_default: input.is_default,
        actor_user_id: scope.actorUserId,
        actor_employee_id: scope.actorEmployeeId,
        idempotency_key: idempotencyKey,
      })
    );
  }

  async update(
    auth: AuthContext,
    warehouseId: string,
    input: WarehouseUpdateInput,
    idempotencyKey: string,
  ): Promise<WarehouseRecord> {
    const scope = this.access.requireManage(auth);
    const command: WarehouseUpdateCommand = {
      warehouse_id: warehouseId,
      tenant_id: scope.tenantId,
      expected_version: input.expected_version,
      actor_user_id: scope.actorUserId,
      actor_employee_id: scope.actorEmployeeId,
      idempotency_key: idempotencyKey,
    };
    if (input.name !== undefined) command.name = input.name;
    if (input.address !== undefined) command.address = input.address;
    if (input.contact_name !== undefined) {
      command.contact_name = input.contact_name;
    }
    if (input.contact_phone !== undefined) {
      command.contact_phone = input.contact_phone;
    }
    if (input.manager_employee_id !== undefined) {
      command.manager_employee_id = input.manager_employee_id;
    }
    if (input.is_default !== undefined) command.is_default = input.is_default;
    if (input.status !== undefined) command.status = input.status;
    return this.mapWarehouseCommandError(() =>
      this.repository.update(command)
    );
  }

  private async mapWarehouseCommandError<T>(
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (isWarehouseStateConflict(error)) {
        throw Errors.business(
          409,
          "仓库状态已变化，请刷新后重试",
          "WAREHOUSE_STATE_CONFLICT",
        );
      }
      throw error;
    }
  }
}

export const warehousesService = new WarehousesService();

function isWarehouseStateConflict(error: unknown): boolean {
  if (!(error instanceof AppError)) return containsConflictToken(error);
  return error.code === "WAREHOUSE_STATE_CONFLICT" ||
    containsConflictToken(error.details);
}

function containsConflictToken(value: unknown): boolean {
  if (typeof value === "string") return value.includes("WAREHOUSE_") &&
    value.includes("_CONFLICT");
  if (Array.isArray(value)) return value.some(containsConflictToken);
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(containsConflictToken);
}

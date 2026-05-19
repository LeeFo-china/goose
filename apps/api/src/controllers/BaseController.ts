import type { FastifyInstance } from "fastify";
import type { RouteHandlerMethod } from "fastify";
import { Errors } from "@/errors/error-factory";
import { z } from "zod";
import { registerRoutes } from "@/utils/decorators/route";
import { PaginationQuerySchema } from "@/schema/request";

export abstract class BaseController<
  TCreate extends z.ZodTypeAny = any, // 创建时的 Zod Schema
  TUpdate extends z.ZodTypeAny = any, // 更新时的 Zod Schema
  T = any,
> {
  protected tableName: string;
  protected createSchema: TCreate | null;
  protected updateSchema: TUpdate | null;
  protected idParamSchema = z.object({ id: z.uuid("无效的 ID 格式") });
  protected paginationQuerySchema = PaginationQuerySchema;

  constructor(
    tableName: string,
    createSchema: TCreate | null = null,
    updateSchema: TUpdate | null = null,
  ) {
    this.tableName = tableName;
    this.createSchema = createSchema;
    this.updateSchema = updateSchema;
  }

  private throwDefaultCrudDisabled(method: string): never {
    throw Errors.business(
      500,
      "BaseController 默认 CRUD 已禁用，请在具体 controller 中显式覆盖该方法",
      "BASE_CONTROLLER_CRUD_DISABLED",
      {
        tableName: this.tableName,
        method,
      },
    );
  }

  getById: RouteHandlerMethod = async () => {
    this.throwDefaultCrudDisabled("getById");
  };

  list: RouteHandlerMethod = async () => {
    this.throwDefaultCrudDisabled("list");
  };

  create: RouteHandlerMethod = async () => {
    this.throwDefaultCrudDisabled("create");
  };

  update: RouteHandlerMethod = async () => {
    this.throwDefaultCrudDisabled("update");
  };

  public registerExtraRoutes = (
    fastify: FastifyInstance,
    tableName: string = "",
  ) => {
    registerRoutes(fastify, this);
  };
}

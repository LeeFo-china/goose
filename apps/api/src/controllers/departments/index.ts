import { TenantBaseController } from "@/controllers/TenantBaseController";
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
} from "@/schema/departments";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { DEPARTMENT_CODE_VALUES } from "@gooes/domain";
import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import { departmentService } from "@/services/departments";

const DepartmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "页码必须大于 0").default(1),
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(100, "每页条数不能超过 100").default(20),
  keyword: z.string().trim().optional(),
  code: z.enum(DEPARTMENT_CODE_VALUES).optional(),
  enabled: z.union([
    z.literal("true").transform(() => true),
    z.literal("false").transform(() => false),
    z.boolean(),
  ]).default(true),
});

const EnableDepartmentsBatchSchema = z.object({
  departments: z
    .array(CreateDepartmentSchema)
    .min(1, "请选择需要启用的部门")
    .max(DEPARTMENT_CODE_VALUES.length, "启用部门数量超出限制"),
});

class DepartmentController extends TenantBaseController<
  typeof CreateDepartmentSchema,
  typeof UpdateDepartmentSchema
> {
  constructor() {
    super("departments", CreateDepartmentSchema, UpdateDepartmentSchema);
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const queryResult = DepartmentListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    return ResponseHandler.success(await departmentService.list({
      tenantId,
      query: queryResult.data,
    }));
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    return ResponseHandler.success(await departmentService.getByLegacyId({
      tenantId,
      id: idVerify.data.id,
    }));
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const result = CreateDepartmentSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);
    return ResponseHandler.success(await departmentService.create({
      tenantId,
      payload: result.data,
    }));
  };

  enableBatch = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const result = EnableDepartmentsBatchSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    return ResponseHandler.success(await departmentService.enableBatch({
      tenantId,
      departments: result.data.departments,
    }));
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (
      request.body &&
      typeof request.body === "object" &&
      "code" in request.body
    ) {
      throw Errors.badRequest("标准部门编码不可修改");
    }

    const result = UpdateDepartmentSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    return ResponseHandler.success(await departmentService.update({
      tenantId,
      id: idVerify.data.id,
      payload: result.data,
    }));
  };

  public override registerExtraRoutes = (
    fastify: FastifyInstance,
    resourceName = "departments",
  ) => {
    fastify.post(`/${resourceName}/enable-batch`, this.enableBatch);
  };
}

export default new DepartmentController();

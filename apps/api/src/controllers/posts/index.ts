import { TenantBaseController } from "@/controllers/TenantBaseController";
import {
  CreatePostSchema,
  CreateTenantPostSchema,
  POST_CODE_PATTERN,
  UpdatePostSchema,
} from "@/schema/post";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  POST_STATUS_VALUES,
  SALARY_TYPE_VALUES,
} from "@gooes/domain";
import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import { postsService } from "@/services/posts";

const PostListQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "页码必须大于 0").default(1),
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(100, "每页条数不能超过 100").default(20),
  keyword: z.string().trim().optional(),
  code: z.string().trim().regex(POST_CODE_PATTERN, "无效的岗位编码").optional(),
  salary_type: z.enum(SALARY_TYPE_VALUES).optional(),
  status: z.coerce.number().refine(
    (value) => POST_STATUS_VALUES.includes(value as (typeof POST_STATUS_VALUES)[number]),
    "无效的岗位状态",
  ).optional(),
});

class PostsController extends TenantBaseController<
  typeof CreatePostSchema,
  typeof UpdatePostSchema
> {
  constructor() {
    super("posts", CreatePostSchema, UpdatePostSchema);
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const queryResult = PostListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    return ResponseHandler.success(
      await postsService.listPosts(queryResult.data, tenantId),
    );
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const result = CreateTenantPostSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    return ResponseHandler.success(
      await postsService.createPost(result.data, tenantId),
    );
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await postsService.getPostById(
      idVerify.data.id,
      tenantId,
    );
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = UpdatePostSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    return ResponseHandler.success(
      await postsService.updatePost(
        idVerify.data.id,
        result.data,
        tenantId,
      ),
    );
  };
}

export default new PostsController();

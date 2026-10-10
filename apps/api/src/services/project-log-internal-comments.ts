import { createHash } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { projectLogInternalCommentsRepository } from "@/repositories/project-log-internal-comments";
import { userIdentityRepository } from "@/repositories/user-identities";
import {
  InternalCommentCreateSchema,
  InternalCommentQuerySchema,
  type InternalCommentCreateInput,
} from "@/schema/project-log-internal-comments";
import { authorizationService } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { contentCheckUnavailable, wechatContentSafetyGateway } from "@/services/wechat-content-safety-gateway";
import type { JwtPayload } from "@/utils/jwt";
import { projectLogCommunicationRollout } from "./project-log-communication-rollout";

type Dependencies = {
  rollout?: Pick<typeof projectLogCommunicationRollout, "assertInternalAvailable">;
  repository?: typeof projectLogInternalCommentsRepository;
  authorization?: Pick<typeof authorizationService, "getRequiredAuthContext">;
  policy?: Pick<typeof accessPolicyService, "canAccessProject" | "canWriteProjectLog">;
  identity?: { findActiveOauthIdentity(platform: "wechat_mini", openid: string): Promise<{ user_id: string } | null> };
  moderation?: Pick<typeof wechatContentSafetyGateway, "checkText">;
};
type RequestActor = { actor: JwtPayload | undefined; logId: string };

export class ProjectLogInternalCommentsService {
  private readonly rollout;
  private readonly repository;
  private readonly authorization;
  private readonly policy;
  private readonly identity;
  private readonly moderation;

  constructor(dependencies: Dependencies = {}) {
    this.rollout = dependencies.rollout ?? projectLogCommunicationRollout;
    this.repository = dependencies.repository ?? projectLogInternalCommentsRepository;
    this.authorization = dependencies.authorization ?? authorizationService;
    this.policy = dependencies.policy ?? accessPolicyService;
    this.identity = dependencies.identity ?? userIdentityRepository;
    this.moderation = dependencies.moderation ?? wechatContentSafetyGateway;
  }

  async create(input: RequestActor & { payload: InternalCommentCreateInput }) {
    const parsed = InternalCommentCreateSchema.safeParse(input.payload);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const payload = parsed.data;
    await this.authorize(input, true);
    await this.rollout.assertInternalAvailable();
    if (payload.images?.length) {
      throw Errors.business(403, "内部评论暂不支持图片", "COMMENT_MEDIA_DISABLED");
    }
    await this.assertParent(input, payload.parent_id);
    const openid = input.actor?.openid;
    if (input.actor?.login_channel !== "wechat" || !openid) throw contentCheckUnavailable();
    const identity = await this.identity.findActiveOauthIdentity("wechat_mini", openid);
    if (!identity || identity.user_id !== input.actor.sub) throw contentCheckUnavailable();
    const result = await this.moderation.checkText({ openid, content: payload.content });
    if (result.status === "rejected") {
      throw Errors.business(422, "发布内容包含违规信息，请修改后重试", "CONTENT_REJECTED");
    }
    // Moderation is a network round trip: check current employee binding and project rights again.
    const { tenantId, employee } = await this.authorize(input, true);
    await this.rollout.assertInternalAvailable();
    await this.assertParent(input, payload.parent_id);
    const row = await this.repository.create({
      tenant_id: tenantId, log_id: input.logId, author_id: employee.id,
      parent_id: payload.parent_id ?? null, content: payload.content,
      moderation_status: result.status,
      moderation_trace_id: result.traceId,
      moderated_at: new Date().toISOString(),
      content_sha256: createHash("sha256").update(payload.content).digest("hex"),
    });
    if (result.status === "pending") {
      return { id: row.id, moderation_status: "pending" as const,
        visibility: "internal" as const, published: false, code: "CONTENT_PENDING" };
    }
    return { ...row, author: employee, images: [], visibility: "internal" as const, published: true };
  }

  async list(input: RequestActor & { page: number; pageSize: number }) {
    const parsed = InternalCommentQuerySchema.safeParse({ page: input.page, pageSize: input.pageSize });
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const { page, pageSize } = parsed.data;
    const { tenantId } = await this.authorize(input, false);
    await this.rollout.assertInternalAvailable();
    const from = (page - 1) * pageSize;
    const result = await this.repository.listApproved({ tenantId, logId: input.logId, from, to: from + pageSize - 1 });
    const authors = await this.repository.listAuthors({ tenantId, employeeIds: result.list.map(row => row.author_id) });
    const byId = new Map(authors.map(author => [author.id, author]));
    return {
      list: result.list.map(row => ({ ...row, author: byId.get(row.author_id) ?? null,
        images: [], visibility: "internal" as const, published: true })),
      total: result.total, page, pageSize,
    };
  }

  private async authorize(input: RequestActor, write: boolean) {
    const actor = input.actor;
    if (!actor?.sub) throw Errors.unauthorized();
    // Current selected identity matters: do not look up an employee for a customer/visitor token.
    if (!actor.employee_id || !actor.tenant_id || actor.roles?.length !== 1
      || actor.roles[0] !== "employee" || (actor.token_type && actor.token_type !== "auth")) {
      throw Errors.forbidden();
    }
    const context = await this.authorization.getRequiredAuthContext(actor.sub, {
      tenantServiceAccess: write ? "write" : "read", requiredCapability: "core.projects",
      freshPermissions: true,
    });
    if (context.employeeId !== actor.employee_id || context.tenantId !== actor.tenant_id
      || context.employeeStatus !== "active" || context.isPlatformAdmin || context.isPlatformStaff) {
      throw Errors.forbidden();
    }
    const employee = await this.repository.findActiveEmployee({
      employeeId: actor.employee_id, tenantId: actor.tenant_id, userId: actor.sub,
    });
    if (!employee) throw Errors.forbidden();
    const log = await this.repository.findLog(input.logId);
    if (!log || log.tenant_id !== actor.tenant_id) throw Errors.forbidden();
    if (!await this.policy.canAccessProject(context, log.project_id, "project.read")) throw Errors.forbidden();
    if (write && !await this.policy.canWriteProjectLog(context, log.project_id)) throw Errors.forbidden();
    return { tenantId: actor.tenant_id, employee };
  }

  private async assertParent(input: RequestActor, parentId?: string | null) {
    if (!parentId) return;
    const tenantId = input.actor?.tenant_id;
    if (!tenantId) throw Errors.forbidden();
    const parent = await this.repository.findApprovedParent({ parentId, tenantId, logId: input.logId });
    if (!parent) throw Errors.badRequest("父评论不可用或不属于当前内部评论区");
  }
}
export const projectLogInternalCommentsService = new ProjectLogInternalCommentsService();

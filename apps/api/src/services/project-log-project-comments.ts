import { createHash } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { projectLogProjectCommentsRepository, type ProjectCommentRow } from "@/repositories/project-log-project-comments";
import { userIdentityRepository } from "@/repositories/user-identities";
import { ProjectCommentCreateSchema, ProjectCommentQuerySchema, type ProjectCommentCreateInput } from "@/schema/project-log-project-comments";
import { projectLogCommunicationAccess, type ProjectCommunicationActor } from "./project-log-communication-access";
import { projectLogCommunicationRollout } from "./project-log-communication-rollout";
import { contentCheckUnavailable, wechatContentSafetyGateway } from "./wechat-content-safety-gateway";
import type { JwtPayload } from "@/utils/jwt";
type RequestActor = {
  actor: JwtPayload | undefined;
  logId: string;
};
type Dependencies = {
  repository?: Pick<typeof projectLogProjectCommentsRepository, "findLog" | "findApprovedParent" | "create" | "listApproved" | "listAuthors">;
  access?: Pick<typeof projectLogCommunicationAccess, "resolve">;
  identity?: {
    findActiveOauthIdentity(platform: "wechat_mini", openid: string): Promise<{
      user_id: string;
    } | null>;
  };
  moderation?: Pick<typeof wechatContentSafetyGateway, "checkText">;
  rollout?: Pick<typeof projectLogCommunicationRollout, "assertProjectAvailable">;
};
export class ProjectLogProjectCommentsService {
  private readonly repository;
  private readonly access;
  private readonly identity;
  private readonly moderation;
  private readonly rollout;
  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? projectLogProjectCommentsRepository;
    this.access = dependencies.access ?? projectLogCommunicationAccess;
    this.identity = dependencies.identity ?? userIdentityRepository;
    this.moderation = dependencies.moderation ?? wechatContentSafetyGateway;
    this.rollout = dependencies.rollout ?? projectLogCommunicationRollout;
  }
  async list(input: RequestActor & {
    page: number;
    pageSize: number;
  }) {
    const parsed = ProjectCommentQuerySchema.safeParse({ page: input.page, pageSize: input.pageSize });
    if (!parsed.success)
      throw Errors.fromZod(parsed.error);
    const context = await this.authorize(input, false);
    if (input.actor?.login_channel !== "admin_web") {
      const identity = input.actor?.openid
        ? await this.identity.findActiveOauthIdentity("wechat_mini", input.actor.openid) : null;
      if (!identity || identity.user_id !== input.actor?.sub) {
        throw Errors.unauthorized("当前微信绑定关系已变化，请重新登录", "WECHAT_BINDING_NOT_MATCHED");
      }
    }
    const { page, pageSize } = parsed.data;
    const from = (page - 1) * pageSize;
    const { list, total } = await this.repository.listApproved({ tenantId: context.tenantId, logId: input.logId, from, to: from + pageSize - 1 });
    const authors = await this.repository.listAuthors({ tenantId: context.tenantId,
      employeeIds: list.flatMap(row => row.employee_author_id ? [row.employee_author_id] : []),
      customerIds: list.flatMap(row => row.customer_author_id ? [row.customer_author_id] : []),
    });
    const byId = new Map(authors.map(author => [`${author.type}:${author.id}`, { id: author.id, name: author.name }]));
    return { list: list.map(row => this.serialize(row, byId.get(`${row.author_type}:${row.employee_author_id ?? row.customer_author_id}`) ?? null)),
      total, page, pageSize, can_write: context.canWrite };
  }
  async create(input: RequestActor & {
    payload: ProjectCommentCreateInput;
  }) {
    const parsed = ProjectCommentCreateSchema.safeParse(input.payload);
    if (!parsed.success)
      throw Errors.fromZod(parsed.error);
    const payload = parsed.data;
    const before = await this.authorize(input, true);
    if (payload.images?.length)
      throw Errors.business(403, "项目沟通暂不支持图片", "COMMENT_MEDIA_DISABLED");
    await this.assertParent(input.logId, before.tenantId, payload.parent_id);
    const openid = await this.checkedOpenid(input.actor);
    const result = await this.moderation.checkText({ openid, content: payload.content });
    if (result.status === "rejected")
      throw Errors.business(422, "发布内容包含违规信息，请修改后重试", "CONTENT_REJECTED");
    // Recheck ownership, membership, permissions, rollout and OAuth binding after the network round trip.
    const current = await this.authorize(input, true);
    await this.checkedOpenid(input.actor);
    await this.assertParent(input.logId, current.tenantId, payload.parent_id);
    const row = await this.repository.create({ tenant_id: current.tenantId, log_id: input.logId,
      author_type: current.type, employee_author_id: current.type === "employee" ? current.author.id : null,
      customer_author_id: current.type === "customer" ? current.author.id : null,
      parent_id: payload.parent_id ?? null, content: payload.content, moderation_status: result.status,
      moderation_trace_id: result.traceId, moderated_at: new Date().toISOString(),
      content_sha256: createHash("sha256").update(payload.content).digest("hex"),
    });
    if (result.status === "pending")
      return { id: row.id, moderation_status: "pending" as const, visibility: "project" as const, published: false as const, code: "CONTENT_PENDING" as const };
    return this.serialize(row, current.author);
  }
  private async authorize(input: RequestActor, write: boolean): Promise<ProjectCommunicationActor> {
    if (!input.actor?.sub)
      throw Errors.unauthorized();
    await this.rollout.assertProjectAvailable();
    const log = await this.repository.findLog(input.logId);
    if (!log)
      throw Errors.forbidden();
    return this.access.resolve({ actor: input.actor, log, write });
  }
  private async checkedOpenid(actor: JwtPayload | undefined): Promise<string> {
    // Existing signed customer sessions omit the channel; the auth plugin accepts
    // them as WeChat only with a bound openid. Revalidate that binding here.
    if (!actor?.openid || (actor.login_channel !== undefined && actor.login_channel !== "wechat"))
      throw contentCheckUnavailable();
    const identity = await this.identity.findActiveOauthIdentity("wechat_mini", actor.openid);
    if (!identity || identity.user_id !== actor.sub)
      throw contentCheckUnavailable();
    return actor.openid;
  }
  private async assertParent(logId: string, tenantId: string, parentId?: string | null): Promise<void> {
    if (!parentId)
      return;
    if (!await this.repository.findApprovedParent({ tenantId, logId, parentId }))
      throw Errors.badRequest("父评论不可用或不属于当前项目沟通");
  }
  private serialize(row: ProjectCommentRow, author: {
    id: string;
    name: string | null;
  } | null) {
    return { id: row.id, log_id: row.log_id, parent_id: row.parent_id, author_type: row.author_type,
      author_id: row.employee_author_id ?? row.customer_author_id, author, content: row.content,
      created_at: row.created_at, moderation_status: row.moderation_status, images: [],
      visibility: "project" as const, published: true as const };
  }
}
export const projectLogProjectCommentsService = new ProjectLogProjectCommentsService();

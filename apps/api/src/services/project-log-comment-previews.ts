import { Errors } from "@/errors/error-factory";
import { projectLogProjectCommentsRepository } from "@/repositories/project-log-project-comments";
import { ProjectCommentPreviewSchema, type ProjectCommentPreviewInput } from "@/schema/project-log-project-comments";
import type { JwtPayload } from "@/utils/jwt";
import { encodeProjectCommentCursor } from "./project-log-comment-cursor";
import { projectLogCommentSerializer, type SerializedProjectComment } from "./project-log-comment-serializer";
import { projectLogCommentSession } from "./project-log-comment-session";

type Dependencies = {
  repository?: Pick<typeof projectLogProjectCommentsRepository, "findLogsForProject" | "listPreviews">;
  session?: Pick<typeof projectLogCommentSession, "authorize">;
  serializer?: Pick<typeof projectLogCommentSerializer, "serialize">;
};
export interface ProjectCommentPreviewResult {
  log_id: string;
  total: number;
  recent_comments: SerializedProjectComment[];
  has_more: boolean;
  older_cursor: string | null;
  can_write: boolean;
}

export class ProjectLogCommentPreviewsService {
  private readonly repository;
  private readonly session;
  private readonly serializer;
  constructor(deps: Dependencies = {}) {
    this.repository = deps.repository ?? projectLogProjectCommentsRepository;
    this.session = deps.session ?? projectLogCommentSession;
    this.serializer = deps.serializer ?? projectLogCommentSerializer;
  }

  // Auxiliary visible-page summary: at most 20 logs, each returning at most 3 comments.
  async list(input: { actor: JwtPayload | undefined; projectId: string; payload: ProjectCommentPreviewInput }): Promise<{ list: ProjectCommentPreviewResult[] }> {
    const parsed = ProjectCommentPreviewSchema.safeParse(input.payload);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const actor = input.actor;
    if (!actor?.sub) throw Errors.unauthorized();
    if (!actor.tenant_id) throw Errors.forbidden();
    const logIds = parsed.data.log_ids;
    const representativeId = logIds[0];
    if (!representativeId) throw Errors.badRequest("请提供项目日志");
    // Authorize before any batch lookup/count: stale sessions and closed rollout cannot probe logs.
    const { context, log } = await this.session.authorize({ actor, logId: representativeId, write: false });
    if (context.tenantId !== actor.tenant_id || log.tenant_id !== actor.tenant_id || log.project_id !== input.projectId) {
      throw Errors.forbidden();
    }
    const scope = { tenantId: actor.tenant_id, projectId: input.projectId, logIds };
    const logs = await this.repository.findLogsForProject(scope);
    const byId = new Map(logs.map(log => [log.id, log]));
    if (logs.length !== logIds.length || logIds.some(id => {
      const log = byId.get(id);
      return !log || log.project_id !== input.projectId || log.tenant_id !== actor.tenant_id;
    })) throw Errors.badRequest("日志不存在或不属于当前项目");
    const previews = await this.repository.listPreviews(scope);
    const rows = previews.flatMap(preview => preview.recent_comments);
    const serialized = await this.serializer.serialize({ tenantId: context.tenantId, rows });
    const byComment = new Map(serialized.map(row => [`${row.log_id}:${row.id}`, row]));
    const byLog = new Map(previews.map(preview => [preview.log_id, preview]));
    return { list: logIds.map(logId => {
      const preview = byLog.get(logId);
      if (!preview) throw Errors.dbError("评论预览未返回日志结果");
      const comments = [...preview.recent_comments].reverse().map(row => {
        const comment = byComment.get(`${logId}:${row.id}`);
        if (!comment) throw Errors.dbError("评论预览日志范围无效");
        return comment;
      });
      const oldest = comments[0];
      const hasMore = preview.total > comments.length;
      return { log_id: logId, total: preview.total, recent_comments: comments, has_more: hasMore,
        older_cursor: hasMore && oldest ? encodeProjectCommentCursor({ logId, createdAt: oldest.created_at, id: oldest.id }) : null,
        can_write: context.canWrite };
    }) };
  }
}

export const projectLogCommentPreviewsService = new ProjectLogCommentPreviewsService();

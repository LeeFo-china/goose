import { createHash } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { projectLogProjectCommentsRepository } from "@/repositories/project-log-project-comments";
import { ProjectCommentV2CreateSchema, ProjectCommentV2QuerySchema, type ProjectCommentV2CreateInput, type ProjectCommentV2QueryInput } from "@/schema/project-log-project-comments";
import type { JwtPayload } from "@/utils/jwt";
import { decodeProjectCommentCursor, encodeProjectCommentCursor } from "./project-log-comment-cursor";
import { projectLogCommentSerializer, type SerializedProjectComment } from "./project-log-comment-serializer";
import { projectLogCommentSession } from "./project-log-comment-session";

type RequestActor = { actor: JwtPayload | undefined; logId: string };
type Dependencies = {
  repository?: Pick<typeof projectLogProjectCommentsRepository, "createV2" | "listPublished">;
  session?: Pick<typeof projectLogCommentSession, "authorize">;
  serializer?: Pick<typeof projectLogCommentSerializer, "serialize">;
};
export interface ProjectCommentV2Page {
  list: SerializedProjectComment[];
  total: number;
  pageSize: number;
  has_more: boolean;
  next_cursor: string | null;
  can_write: boolean;
}

export class ProjectLogProjectCommentsV2Service {
  private readonly repository;
  private readonly session;
  private readonly serializer;
  constructor(deps: Dependencies = {}) {
    this.repository = deps.repository ?? projectLogProjectCommentsRepository;
    this.session = deps.session ?? projectLogCommentSession;
    this.serializer = deps.serializer ?? projectLogCommentSerializer;
  }

  async list(input: RequestActor & ProjectCommentV2QueryInput): Promise<ProjectCommentV2Page> {
    const parsed = ProjectCommentV2QuerySchema.safeParse({ contract_version: input.contract_version, pageSize: input.pageSize, before: input.before });
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const { pageSize, before } = parsed.data;
    const position = before ? decodeProjectCommentCursor(before, input.logId) : undefined;
    const { context } = await this.session.authorize({ actor: input.actor, logId: input.logId, write: false });
    const page = await this.repository.listPublished({ tenantId: context.tenantId, logId: input.logId, pageSize, before: position });
    const oldest = page.list.at(-1);
    const list = await this.serializer.serialize({ tenantId: context.tenantId, rows: [...page.list].reverse() });
    return { list, total: page.total, pageSize, has_more: page.hasMore, can_write: context.canWrite,
      next_cursor: page.hasMore && oldest ? encodeProjectCommentCursor({ logId: input.logId, createdAt: oldest.created_at, id: oldest.id }) : null };
  }

  async create(input: RequestActor & { payload: ProjectCommentV2CreateInput }): Promise<SerializedProjectComment> {
    const parsed = ProjectCommentV2CreateSchema.safeParse(input.payload);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const actor = input.actor;
    if (!actor?.sub) throw Errors.unauthorized();
    // Every retry rechecks current ownership, selected identity, OAuth and write access.
    const { context } = await this.session.authorize({ actor, logId: input.logId, write: true });
    const payload = parsed.data;
    const parentId = payload.parent_id ?? null;
    const payloadSha256 = createHash("sha256").update(JSON.stringify({
      log_id: input.logId, parent_id: parentId, content: payload.content, attachment_ids: payload.attachment_ids,
    })).digest("hex");
    const row = await this.repository.createV2({ tenantId: context.tenantId, logId: input.logId,
      authUserId: actor.sub, authorType: context.type, authorId: context.author.id,
      content: payload.content, parentId, attachmentIds: payload.attachment_ids,
      clientRequestId: payload.client_request_id, payloadSha256 });
    const [comment] = await this.serializer.serialize({ tenantId: context.tenantId, rows: [row] });
    if (!comment) throw Errors.dbError("保存评论未返回发布结果");
    return comment;
  }
}

export const projectLogProjectCommentsV2Service = new ProjectLogProjectCommentsV2Service();

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { ProjectLogCommentAttachmentStorage, type CommentAttachmentLocation, type CommentAttachmentStoragePort } from "@/gateways/project-log-comment-attachment-storage/client";
import { projectLogCommentAttachmentsRepository, type ProjectCommentAttachmentRow, type ProjectCommentUploadRow, type ProjectCommentUploadScope } from "@/repositories/project-log-comment-attachments";
import { ProjectCommentAttachmentInitSchema, ProjectCommentAttachmentCompleteSchema, PROJECT_COMMENT_ATTACHMENT_SCENE } from "@/schema/project-log-comment-attachments";
import { getCosConfig } from "@/services/files/platform-file-storage/legacy/config";
import type { JwtPayload } from "@/utils/jwt";
import { projectLogCommentSession } from "./project-log-comment-session";

type ActorInput = { actor: JwtPayload | undefined; logId: string };
type UploadRepository = Pick<typeof projectLogCommentAttachmentsRepository, "reserveUpload" | "findUpload" | "completeUpload" | "findPublishedAttachment">;
type Session = Pick<typeof projectLogCommentSession, "authorize">;
interface Dependencies {
  repository?: UploadRepository;
  session?: Session;
  storage?: CommentAttachmentStoragePort;
}
export interface SignedProjectCommentAttachment {
  comment_id: string;
  file_id: string;
  url: string;
  expires_at: string;
  width: number;
  height: number;
  mime_type: string;
}
const configCache = {};
export const projectLogCommentAttachmentStorage = new ProjectLogCommentAttachmentStorage({ loadConfig: () => getCosConfig.call(configCache) });

export class ProjectLogCommentAttachmentsService {
  private readonly repository;
  private readonly session;
  private readonly storage;
  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? projectLogCommentAttachmentsRepository;
    this.session = dependencies.session ?? projectLogCommentSession;
    this.storage = dependencies.storage ?? projectLogCommentAttachmentStorage;
  }
  async init(input: ActorInput & { payload: unknown }) {
    const parsed = ProjectCommentAttachmentInitSchema.safeParse(input.payload);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const { context } = await this.session.authorize({ actor: input.actor, logId: input.logId, write: true });
    if (!input.actor?.sub) throw Errors.unauthorized();
    const fileId = randomUUID();
    const location = await this.storage.allocate({ tenantId: context.tenantId, logId: input.logId, uploadId: fileId });
    const scope = { fileId, tenantId: context.tenantId, logId: input.logId,
      authUserId: input.actor.sub, authorType: context.type, authorId: context.author.id };
    // SQL serializes admission per selected identity and creates both records only after quota checks.
    // Failed reservations create neither records nor usable credentials.
    const reserved = await this.repository.reserveUpload({ ...scope, ...location,
      mimeType: parsed.data.mime_type, sizeBytes: parsed.data.size_bytes, originalName: parsed.data.filename });
    this.assertOwned(reserved, scope);
    if (reserved.status !== "uploading" || reserved.comment_id !== null || reserved.position !== null) throw Errors.forbidden();
    this.assertCredentialExpiry(reserved.upload_expires_at);
    const signed = await this.storage.signPut({ ...location, mimeType: parsed.data.mime_type, sizeBytes: parsed.data.size_bytes });
    this.assertCredentialExpiry(reserved.upload_expires_at, signed.expiresAt);
    // A signed credential is returned only if the session still has write access after storage/DB work.
    const current = await this.session.authorize({ actor: input.actor, logId: input.logId, write: true });
    if (current.context.tenantId !== context.tenantId || current.context.type !== context.type || current.context.author.id !== context.author.id) throw Errors.forbidden();
    this.assertCredentialExpiry(reserved.upload_expires_at, signed.expiresAt);
    return { file_id: fileId, upload_url: signed.uploadUrl, method: "PUT" as const, headers: signed.headers, expires_at: signed.expiresAt };
  }
  async complete(input: ActorInput & { payload: unknown }) {
    const parsed = ProjectCommentAttachmentCompleteSchema.safeParse(input.payload);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const scope = await this.scope(input, parsed.data.file_id);
    const row = await this.repository.findUpload(scope);
    this.assertOwned(row, scope);
    const location = attachmentLocation(row, scope.tenantId);
    if (row.status === "complete" || row.status === "attached") return this.completed(row);
    if (row.status !== "uploading" || !Number.isFinite(Date.parse(row.upload_expires_at)) || Date.parse(row.upload_expires_at) <= Date.now()) {
      throw Errors.business(409, "上传已过期，请重新上传", "COMMENT_ATTACHMENT_UPLOAD_EXPIRED");
    }
    const verified = await this.storage.finalize({ ...location, mimeType: row.file.mime_type, sizeBytes: row.file.size_bytes });
    const currentScope = await this.scope(input, parsed.data.file_id);
    this.assertOwned(row, currentScope);
    await this.repository.completeUpload({ ...currentScope, verified });
    const completed = await this.repository.findUpload(currentScope);
    this.assertOwned(completed, currentScope);
    return this.completed(completed);
  }
  async url(input: ActorInput & { commentId: string; fileId: string }): Promise<SignedProjectCommentAttachment> {
    if (![input.commentId, input.fileId].every(value => z.uuid().safeParse(value).success)) throw Errors.badRequest("无效的评论或附件 ID");
    const { context } = await this.session.authorize({ actor: input.actor, logId: input.logId, write: false });
    const row = await this.repository.findPublishedAttachment({ tenantId: context.tenantId, logId: input.logId, commentId: input.commentId, fileId: input.fileId });
    if (!row || row.log_id !== input.logId || row.comment_id !== input.commentId || row.file_id !== input.fileId) throw Errors.forbidden();
    const [signed] = await this.signAttachments({ tenantId: context.tenantId, rows: [row] });
    if (!signed) throw Errors.forbidden();
    return signed;
  }
  /** Internal only: rows MUST come from listAttachments after authorizing all requested logs. No DB calls here. */
  async signAttachments(input: { tenantId: string; rows: ProjectCommentAttachmentRow[] }): Promise<SignedProjectCommentAttachment[]> {
    if (input.rows.length > 900 || new Set(input.rows.map(row => row.comment_id)).size > 100) throw Errors.badRequest("附件批量范围超限");
    const locations = input.rows.map(row => {
      if (row.status !== "attached" || !row.comment_id) throw Errors.forbidden();
      this.completed(row);
      return attachmentLocation(row, input.tenantId);
    });
    const signed = await this.storage.signReads(locations);
    return input.rows.map((row, index) => ({ comment_id: row.comment_id!, file_id: row.file_id,
      url: signed[index]!.url, expires_at: signed[index]!.expiresAt, width: row.file.width!, height: row.file.height!, mime_type: row.file.mime_type }));
  }
  private assertCredentialExpiry(reservedExpiry: string, issuedExpiry?: string): void {
    const reservedAt = Date.parse(reservedExpiry);
    const issuedAt = issuedExpiry === undefined ? reservedAt : Date.parse(issuedExpiry);
    if (!Number.isFinite(reservedAt) || !Number.isFinite(issuedAt) || reservedAt <= Date.now()
      || issuedAt <= Date.now() || issuedAt > reservedAt) {
      throw Errors.business(409, "上传凭证已超过预留期限，请重新上传", "COMMENT_ATTACHMENT_UPLOAD_EXPIRED");
    }
  }
  private async scope(input: ActorInput, fileId: string): Promise<ProjectCommentUploadScope> {
    const { context } = await this.session.authorize({ actor: input.actor, logId: input.logId, write: true });
    if (!input.actor?.sub) throw Errors.unauthorized();
    return { fileId, logId: input.logId, tenantId: context.tenantId, authUserId: input.actor.sub, authorType: context.type, authorId: context.author.id };
  }
  private assertOwned<Row extends ProjectCommentUploadRow>(row: Row | null, scope: ProjectCommentUploadScope): asserts row is Row {
    if (!row || row.file_id !== scope.fileId || row.tenant_id !== scope.tenantId || row.log_id !== scope.logId
      || row.auth_user_id !== scope.authUserId || row.author_type !== scope.authorType || row.author_id !== scope.authorId) throw Errors.forbidden();
  }
  private completed(row: ProjectCommentAttachmentRow) {
    attachmentLocation(row, row.tenant_id);
    if (!["complete", "attached"].includes(row.status) || row.file.metadata.upload_verified !== true
      || row.file.metadata.upload_status !== "uploaded" || !row.file.width || !row.file.height
      || !row.file.checksum || !row.file.object_key.endsWith(`/final/${row.file.checksum}`)) throw Errors.forbidden();
    return { file_id: row.file_id, status: "complete" as const, mime_type: row.file.mime_type, width: row.file.width, height: row.file.height };
  }
}
export const projectLogCommentAttachmentsService = new ProjectLogCommentAttachmentsService();

function attachmentLocation(row: ProjectCommentAttachmentRow, tenantId: string): CommentAttachmentLocation {
    const file = row.file;
    const prefix = `private/project-log-project-comments/${tenantId}/${row.log_id}/`;
    if (row.tenant_id !== tenantId || file.id !== row.file_id || file.tenant_id !== tenantId || file.provider !== "tencent_cos"
      || file.scene !== PROJECT_COMMENT_ATTACHMENT_SCENE || file.visibility !== "private" || file.public_url !== null
      || file.owner_type !== "project_log" || file.owner_id !== row.log_id || file.status !== "active" || file.deleted_at !== null
      || !file.region || !file.object_key.startsWith(prefix) || typeof file.metadata.raw_object_key !== "string") throw Errors.forbidden();
    return { bucket: file.bucket, region: file.region, objectKey: file.object_key, rawObjectKey: file.metadata.raw_object_key };
  }

interface CleanupDependencies {
  repository: Pick<typeof projectLogCommentAttachmentsRepository, "claimOrphans" | "finishOrphanCleanup">;
  storage: Pick<CommentAttachmentStoragePort, "remove">;
}
/** Existing reconciliation worker calls one bounded batch; SQL claims fence completion and linking. */
export async function runProjectCommentAttachmentCleanupTick(
  options: { enabled: boolean; apply: boolean },
  dependencies: CleanupDependencies = { repository: projectLogCommentAttachmentsRepository, storage: projectLogCommentAttachmentStorage },
): Promise<{ scanned: number; deleted: number; failed: number } | null> {
  if (!options.enabled || !options.apply) return null; // Claiming is a mutation, never do it in dry-run.
  const summary = { scanned: 0, deleted: 0, failed: 0 };
  try {
    const rows = await dependencies.repository.claimOrphans({ limit: 100 });
    if (rows.length > 100) throw Errors.badRequest("清理数量超限");
    summary.scanned = rows.length;
    for (const row of rows) {
      try {
        if (row.status !== "cleanup" || row.comment_id !== null || row.position !== null
          || !Number.isFinite(Date.parse(row.created_at)) || Date.parse(row.created_at) > Date.now() - 24 * 60 * 60 * 1000
          || !Number.isFinite(Date.parse(row.upload_expires_at)) || Date.parse(row.upload_expires_at) >= Date.now()) throw Errors.forbidden();
        await dependencies.storage.remove(attachmentLocation(row, row.tenant_id));
        if (await dependencies.repository.finishOrphanCleanup({ fileId: row.file_id })) summary.deleted++;
        else summary.failed++;
      } catch {
        // SQL leases cleanup for 15 minutes and then returns failures for retry. Never log private keys.
        summary.failed++;
      }
    }
  } catch { summary.failed++; }
  return summary;
}

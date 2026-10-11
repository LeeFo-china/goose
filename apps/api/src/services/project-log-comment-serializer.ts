import { Errors } from "@/errors/error-factory";
import { projectLogProjectCommentsRepository, type ProjectCommentAuthor, type ProjectCommentV2Row } from "@/repositories/project-log-project-comments";
import { projectLogCommentAttachmentsRepository } from "@/repositories/project-log-comment-attachments";
import { projectLogCommentAttachmentsService } from "./project-log-comment-attachments";

type Author = { id: string; name: string | null };
type SignedAttachment = Awaited<ReturnType<typeof projectLogCommentAttachmentsService.signAttachments>>[number];
export interface ProjectCommentReplySummary {
  id: string;
  author_type: "employee" | "customer";
  author_id: string | null;
  author: Author | null;
  content: string;
}
export interface SerializedProjectComment extends ProjectCommentReplySummary {
  log_id: string;
  parent_id: string | null;
  created_at: string;
  published: true;
  visibility: "project";
  attachments: Omit<SignedAttachment, "comment_id">[];
  reply_to: ProjectCommentReplySummary | null;
}
type Dependencies = {
  repository?: Pick<typeof projectLogProjectCommentsRepository, "listPublishedParents" | "listAuthors">;
  attachments?: Pick<typeof projectLogCommentAttachmentsRepository, "listAttachments">;
  signer?: Pick<typeof projectLogCommentAttachmentsService, "signAttachments">;
};

function authorId(row: ProjectCommentV2Row): string | null {
  return row.author_type === "employee" ? row.employee_author_id : row.customer_author_id;
}

export class ProjectLogCommentSerializer {
  private readonly repository;
  private readonly attachments;
  private readonly signer;
  constructor(deps: Dependencies = {}) {
    this.repository = deps.repository ?? projectLogProjectCommentsRepository;
    this.attachments = deps.attachments ?? projectLogCommentAttachmentsRepository;
    this.signer = deps.signer ?? projectLogCommentAttachmentsService;
  }

  // Caller must authorize this request before supplying tenant-scoped published rows.
  async serialize(input: { tenantId: string; rows: ProjectCommentV2Row[] }): Promise<SerializedProjectComment[]> {
    const { tenantId, rows } = input;
    if (!rows.length) return [];
    if (rows.length > 100 || rows.some(row => !row.published || row.moderation_status === "pending")) {
      throw Errors.dbError("评论发布数据无效");
    }
    const scopedRows = new Map(rows.map(row => [`${row.log_id}:${row.id}`, row]));
    const missingParents = [...new Set(rows.flatMap(row => row.parent_id && !scopedRows.has(`${row.log_id}:${row.parent_id}`) ? [row.parent_id] : []))];
    const logIds = [...new Set(rows.map(row => row.log_id))];
    const [parents, attachments] = await Promise.all([
      missingParents.length ? this.repository.listPublishedParents({ tenantId, logIds, commentIds: missingParents }) : [],
      this.attachments.listAttachments({ tenantId, commentIds: rows.map(row => row.id) }),
    ]);
    for (const parent of parents) {
      if (parent.published && parent.moderation_status !== "pending" && logIds.includes(parent.log_id)) {
        scopedRows.set(`${parent.log_id}:${parent.id}`, parent);
      }
    }
    const [authors, signed] = await Promise.all([
      this.authors(tenantId, [...scopedRows.values()]),
      this.signer.signAttachments({ tenantId, rows: attachments }),
    ]);
    const byAuthor = new Map(authors.map(author => [`${author.type}:${author.id}`, { id: author.id, name: author.name }]));
    const byComment = new Map<string, Omit<SignedAttachment, "comment_id">[]>();
    for (const { comment_id, ...attachment } of signed) {
      if (comment_id === null) continue;
      const list = byComment.get(comment_id) ?? [];
      list.push(attachment);
      byComment.set(comment_id, list);
    }
    return rows.map(row => {
      const parent = row.parent_id ? scopedRows.get(`${row.log_id}:${row.parent_id}`) : undefined;
      return { ...this.summary(row, byAuthor), log_id: row.log_id, parent_id: row.parent_id,
        created_at: row.created_at, published: true, visibility: "project",
        attachments: byComment.get(row.id) ?? [], reply_to: parent ? this.summary(parent, byAuthor) : null };
    });
  }

  private async authors(tenantId: string, rows: ProjectCommentV2Row[]): Promise<ProjectCommentAuthor[]> {
    const employeeIds = [...new Set(rows.flatMap(row => row.author_type === "employee" && row.employee_author_id ? [row.employee_author_id] : []))];
    const customerIds = [...new Set(rows.flatMap(row => row.author_type === "customer" && row.customer_author_id ? [row.customer_author_id] : []))];
    const batches: Promise<ProjectCommentAuthor[]>[] = [];
    // One 100-row page plus 100 parent summaries needs at most two bounded batches.
    for (let offset = 0; offset < Math.max(employeeIds.length, customerIds.length); offset += 100) {
      batches.push(this.repository.listAuthors({ tenantId, employeeIds: employeeIds.slice(offset, offset + 100), customerIds: customerIds.slice(offset, offset + 100) }));
    }
    return (await Promise.all(batches)).flat();
  }

  private summary(row: ProjectCommentV2Row, authors: Map<string, Author>): ProjectCommentReplySummary {
    const id = authorId(row);
    return { id: row.id, author_type: row.author_type, author_id: id,
      author: authors.get(`${row.author_type}:${id}`) ?? null, content: row.content };
  }
}

export const projectLogCommentSerializer = new ProjectLogCommentSerializer();

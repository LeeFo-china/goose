import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  postsRepository,
  type PostListQuery,
} from "@/repositories/posts";
import type {
  CreatePostInput,
  UpdatePostInput,
} from "@/schema/post";

class PostsService {
  private requireTenantId(tenantId?: string | null) {
    if (!tenantId) {
      throw Errors.business(
        403,
        "岗位管理必须在租户上下文中操作",
        "TENANT_CONTEXT_REQUIRED",
      );
    }

    return tenantId;
  }

  private normalizeCode(code: string | null | undefined) {
    if (code === undefined) return undefined;
    const normalized = code?.trim().toUpperCase() || "";
    return normalized || null;
  }

  private normalizeName(name: string | undefined) {
    return name?.trim();
  }

  private async ensureCodeUnique(
    code: string | null | undefined,
    tenantId?: string | null,
    currentId?: string,
  ) {
    if (!code) return;

    const existing = await postsRepository.findByCode(code, tenantId);
    if (existing && existing.id !== currentId) {
      throw Errors.business(
        400,
        "岗位编码已存在",
        ErrorCodes.POST_CODE_DUPLICATED,
      );
    }
  }

  async listPosts(query: PostListQuery, tenantId?: string | null) {
    const scopedTenantId = this.requireTenantId(tenantId);
    return postsRepository.list({
      ...query,
      tenantId: scopedTenantId,
      code: this.normalizeCode(query.code) || undefined,
      keyword: query.keyword?.trim(),
    });
  }

  async getPostById(id: string, tenantId?: string | null) {
    const scopedTenantId = this.requireTenantId(tenantId);
    const existing = await postsRepository.findById(id, scopedTenantId);
    if (!existing) {
      throw Errors.business(404, "岗位不存在", ErrorCodes.POST_NOT_FOUND);
    }

    return existing;
  }

  async createPost(input: CreatePostInput, tenantId?: string | null) {
    const scopedTenantId = this.requireTenantId(tenantId);
    const code = this.normalizeCode(input.code);
    if (!code) {
      throw Errors.badRequest("岗位编码不能为空");
    }

    const normalized = {
      ...input,
      code,
      name: this.normalizeName(input.name) || input.name,
    };
    await this.ensureCodeUnique(normalized.code, scopedTenantId);
    return postsRepository.create({
      ...normalized,
      tenant_id: scopedTenantId,
    });
  }

  async updatePost(id: string, input: UpdatePostInput, tenantId?: string | null) {
    const scopedTenantId = this.requireTenantId(tenantId);
    const existing = await postsRepository.findById(id, scopedTenantId);
    if (!existing) {
      throw Errors.business(404, "岗位不存在", ErrorCodes.POST_NOT_FOUND);
    }

    const normalized: UpdatePostInput = {
      ...input,
      ...(input.name !== undefined ? { name: this.normalizeName(input.name) || input.name } : {}),
    };
    if (input.code !== undefined) {
      const code = this.normalizeCode(input.code);
      if (!code) {
        throw Errors.badRequest("岗位编码不能为空");
      }
      normalized.code = code;
    }

    await this.ensureCodeUnique(normalized.code, scopedTenantId, existing.id);
    return postsRepository.update(id, normalized, scopedTenantId);
  }
}

export const postsService = new PostsService();

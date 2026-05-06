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
  private normalizeCode(code: string | null | undefined) {
    if (code === undefined) return undefined;
    const normalized = code?.trim().toUpperCase() || "";
    return normalized || null;
  }

  private normalizeName(name: string | undefined) {
    return name?.trim();
  }

  private async ensureCodeUnique(code: string | null | undefined, currentId?: string) {
    if (!code) return;

    const existing = await postsRepository.findByCode(code);
    if (existing && existing.id !== currentId) {
      throw Errors.business(
        400,
        "岗位编码已存在",
        ErrorCodes.POST_CODE_DUPLICATED,
      );
    }
  }

  async listPosts(query: PostListQuery) {
    return postsRepository.list({
      ...query,
      code: this.normalizeCode(query.code) || undefined,
      keyword: query.keyword?.trim(),
    });
  }

  async createPost(input: CreatePostInput) {
    const code = this.normalizeCode(input.code);
    if (!code) {
      throw Errors.badRequest("岗位编码不能为空");
    }

    const normalized = {
      ...input,
      code,
      name: this.normalizeName(input.name) || input.name,
    };
    await this.ensureCodeUnique(normalized.code);
    return postsRepository.create(normalized);
  }

  async updatePost(id: string, input: UpdatePostInput) {
    const existing = await postsRepository.findById(id);
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

    await this.ensureCodeUnique(normalized.code, existing.id);
    return postsRepository.update(id, normalized);
  }
}

export const postsService = new PostsService();

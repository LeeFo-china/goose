import type {
  DouyinMaterialNoteStatus,
  DouyinMaterialNoteVersionDraft,
} from "@gooes/domain";
import { z } from "zod";

import {
  assertMaterialNoteRequestedPage,
  buildMaterialNoteCategoryListQuery,
  buildMaterialNoteListQuery,
  getMaterialNoteActions,
  type MaterialNoteAction,
  type MaterialNoteCategoryFilters,
  type MaterialNoteFilters,
  parseMaterialNoteAppendResult,
  parseMaterialNoteCategory,
  parseMaterialNoteCategoryCreate,
  parseMaterialNoteCategoryList,
  parseMaterialNoteCreateResult,
  parseMaterialNoteDetail,
  parseMaterialNoteDraft,
  parseMaterialNoteList,
  parseMaterialNoteTransitionResult,
  parseMaterialNoteVersion,
  parseMaterialNoteVersionList,
} from "@/components/douyin-miniapp/material-note-contract";
import { requestBackendJson } from "@/lib/backend-client";

const API_PATH = "/tenant/douyin-material-notes";
const CATEGORY_API_PATH = "/tenant/douyin-material-note-categories";
const idSchema = z.string().uuid();

type ReasonCommandBody = {
  expected_status: DouyinMaterialNoteStatus;
  reason: string;
};

type PublishCommandBody = {
  version_id: string;
  expected_status: DouyinMaterialNoteStatus;
};

export type MaterialNoteCommandRequest = {
  readonly noteId: string;
  readonly action: MaterialNoteAction;
  readonly path: string;
  readonly idempotencyKey: string;
  readonly body: PublishCommandBody | ReasonCommandBody;
  readonly serializedBody: string;
};

export async function listMaterialNotes(filters: MaterialNoteFilters) {
  const raw = await requestBackendJson<unknown>(
    `${API_PATH}?${buildMaterialNoteListQuery(filters)}`,
    { cache: "no-store", fallbackMessage: "资料列表加载失败" },
  );
  const result = parseMaterialNoteList(raw);
  assertMaterialNoteRequestedPage(result.pagination, filters);
  return result;
}

export async function listMaterialNoteCategories(filters: MaterialNoteCategoryFilters) {
  const requested = {
    page: filters.page,
    pageSize: Math.min(100, filters.pageSize),
  };
  const raw = await requestBackendJson<unknown>(
    `${CATEGORY_API_PATH}?${buildMaterialNoteCategoryListQuery(filters)}`,
    { cache: "no-store", fallbackMessage: "资料分类加载失败" },
  );
  const result = parseMaterialNoteCategoryList(raw);
  assertMaterialNoteRequestedPage(result.pagination, requested);
  return result;
}

export async function createMaterialNoteCategory(input: unknown) {
  const body = parseMaterialNoteCategoryCreate(input);
  const raw = await requestBackendJson<unknown>(CATEGORY_API_PATH, {
    method: "POST",
    body: JSON.stringify(body),
    fallbackMessage: "创建资料分类失败",
  });
  return parseMaterialNoteCategory(raw);
}

export async function getMaterialNote(noteId: string) {
  const id = idSchema.parse(noteId);
  const raw = await requestBackendJson<unknown>(`${API_PATH}/${id}`, {
    cache: "no-store",
    fallbackMessage: "资料详情加载失败",
  });
  return parseMaterialNoteDetail(raw);
}

export async function listMaterialNoteVersions(
  noteId: string,
  pagination: { page: number; pageSize: number },
) {
  const id = idSchema.parse(noteId);
  const query = new URLSearchParams({
    page: String(pagination.page),
    pageSize: String(Math.min(100, pagination.pageSize)),
  });
  const raw = await requestBackendJson<unknown>(
    `${API_PATH}/${id}/versions?${query}`,
    { cache: "no-store", fallbackMessage: "版本历史加载失败" },
  );
  const result = parseMaterialNoteVersionList(raw);
  assertMaterialNoteRequestedPage(result.pagination, {
    page: pagination.page,
    pageSize: Math.min(100, pagination.pageSize),
  });
  return result;
}

export async function getMaterialNoteVersion(noteId: string, versionId: string) {
  const id = idSchema.parse(noteId);
  const version = idSchema.parse(versionId);
  const raw = await requestBackendJson<unknown>(
    `${API_PATH}/${id}/versions/${version}`,
    { cache: "no-store", fallbackMessage: "版本正文加载失败" },
  );
  return parseMaterialNoteVersion(raw);
}

export async function createMaterialNote(input: DouyinMaterialNoteVersionDraft) {
  const draft = parseMaterialNoteDraft(input);
  const raw = await requestBackendJson<unknown>(API_PATH, {
    method: "POST",
    body: JSON.stringify(draft),
    fallbackMessage: "创建资料失败",
  });
  return parseMaterialNoteCreateResult(raw);
}

export async function appendMaterialNoteVersion(
  noteId: string,
  input: DouyinMaterialNoteVersionDraft,
) {
  const id = idSchema.parse(noteId);
  const draft = parseMaterialNoteDraft(input);
  const raw = await requestBackendJson<unknown>(`${API_PATH}/${id}/versions`, {
    method: "POST",
    body: JSON.stringify(draft),
    fallbackMessage: "保存新版本失败",
  });
  return parseMaterialNoteAppendResult(raw);
}

export function createMaterialNoteCommandRequest(input: {
  noteId: string;
  action: MaterialNoteAction;
  expectedStatus: DouyinMaterialNoteStatus;
  versionId?: string;
  reason?: string;
}, randomUUID: () => string = () => globalThis.crypto.randomUUID()): MaterialNoteCommandRequest {
  const noteId = idSchema.parse(input.noteId);
  if (!getMaterialNoteActions(input.expectedStatus, true).includes(input.action)) {
    throw new Error("当前资料状态不允许此操作");
  }

  const body = input.action === "publish"
    ? createPublishBody(input.expectedStatus, input.versionId)
    : createReasonBody(input.action, input.expectedStatus, input.reason);
  const idempotencyKey = idSchema.parse(randomUUID());
  return {
    noteId,
    action: input.action,
    path: `${API_PATH}/${noteId}/${input.action}`,
    idempotencyKey,
    body,
    serializedBody: JSON.stringify(body),
  };
}

export async function executeMaterialNoteCommand(request: MaterialNoteCommandRequest) {
  const raw = await requestBackendJson<unknown>(request.path, {
    method: "POST",
    headers: { "Idempotency-Key": request.idempotencyKey },
    body: request.serializedBody,
    fallbackMessage: "资料状态更新失败",
  });
  return parseMaterialNoteTransitionResult(raw);
}

export function getMaterialNoteErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const requestError = error as { code?: string; status?: number; message?: string };
  if (requestError.code === "MATERIAL_NOTE_NOT_FOUND" || requestError.status === 404) {
    return "资料或版本不存在，请返回列表刷新";
  }
  if (requestError.code === "MATERIAL_NOTE_WITHDRAWN" || requestError.status === 410) {
    return "资料已合规撤回，不能继续编辑或发布";
  }
  if (requestError.code === "MATERIAL_NOTE_VERSION_CONFLICT") {
    return "目标版本已变化，请刷新版本列表后重新确认";
  }
  if (requestError.code === "MATERIAL_NOTE_STATE_CONFLICT" || requestError.status === 409) {
    return "资料状态已变化，请刷新后重新确认";
  }
  if (requestError.status === 403) return "当前账号没有执行此操作的权限";
  return requestError.message?.trim() || fallback;
}

function createPublishBody(
  expectedStatus: DouyinMaterialNoteStatus,
  versionId: string | undefined,
): PublishCommandBody {
  return {
    version_id: idSchema.parse(versionId),
    expected_status: expectedStatus,
  };
}

function createReasonBody(
  action: "archive" | "withdraw",
  expectedStatus: DouyinMaterialNoteStatus,
  reason: string | undefined,
): ReasonCommandBody {
  const trimmedReason = reason?.trim() ?? "";
  if (!trimmedReason) {
    throw new Error(action === "withdraw" ? "撤回原因不能为空" : "归档原因不能为空");
  }
  if (trimmedReason.length > 1_000) throw new Error("操作原因不能超过 1000 个字符");
  return { expected_status: expectedStatus, reason: trimmedReason };
}

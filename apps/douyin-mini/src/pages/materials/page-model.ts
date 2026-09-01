import type {
  DouyinMaterialNotePreview,
  DouyinMaterialNotePublicPage,
} from "../../models";
import {
  beginPaginationRequest,
  createPaginationState,
  rejectPaginationRequest,
  resolvePaginationRequest,
  type PaginationRequest,
  type PaginationState,
} from "../../utils/pagination";

const SEARCH_DEBOUNCE_MS = 400;
const MAX_KEYWORD_LENGTH = 120;

type MaterialPagePhase = "new" | "visible" | "hidden" | "unloaded";
export type MaterialOperationAuthority = { epoch: number };

export class MaterialExperienceLifecycle {
  private phase: MaterialPagePhase = "new";
  private epoch = 0;

  onLoad(): boolean {
    if (this.phase !== "new") return false;
    this.phase = "visible";
    this.epoch += 1;
    return true;
  }

  onShow(): boolean {
    if (this.phase === "unloaded" || this.phase === "visible") return false;
    this.phase = "visible";
    this.epoch += 1;
    return true;
  }

  onHide(): boolean {
    if (this.phase !== "visible") return false;
    this.phase = "hidden";
    this.epoch += 1;
    return true;
  }

  onUnload(): boolean {
    if (this.phase === "unloaded") return false;
    this.phase = "unloaded";
    this.epoch += 1;
    return true;
  }

  beginOperation(): MaterialOperationAuthority | null {
    return this.phase === "visible" ? { epoch: this.epoch } : null;
  }

  isCurrent(authority: MaterialOperationAuthority): boolean {
    return this.phase === "visible" && authority.epoch === this.epoch;
  }
}

export type MaterialListRequest = PaginationRequest & { keyword?: string };
export type MaterialListView = {
  firstLoading: boolean;
  firstError: boolean;
  empty: boolean;
  paginationStatus: PaginationState<DouyinMaterialNotePreview>["status"];
};
export type MaterialListPageState = {
  keyword: string;
  appliedKeyword: string;
  debounceSequence: number;
  pagination: PaginationState<DouyinMaterialNotePreview>;
  view: MaterialListView;
};

export function createMaterialListPageState(pageSize = 20): MaterialListPageState {
  return withView({
    keyword: "",
    appliedKeyword: "",
    debounceSequence: 0,
    pagination: createPaginationState<DouyinMaterialNotePreview>(pageSize),
  });
}

export function updateMaterialKeyword(
  current: MaterialListPageState,
  keyword: string,
): {
  state: MaterialListPageState;
  debounce: { sequence: number; delayMs: number };
} {
  const sequence = current.debounceSequence + 1;
  return {
    state: withView({
      ...current,
      keyword: keyword.slice(0, MAX_KEYWORD_LENGTH),
      debounceSequence: sequence,
    }),
    debounce: { sequence, delayMs: SEARCH_DEBOUNCE_MS },
  };
}

export function applyMaterialKeyword(
  current: MaterialListPageState,
  sequence: number,
): { state: MaterialListPageState; request: MaterialListRequest | null } {
  if (sequence !== current.debounceSequence) return { state: current, request: null };
  const appliedKeyword = current.keyword.trim();
  if (appliedKeyword === current.appliedKeyword) return { state: current, request: null };
  return beginWithKeyword(
    withView({ ...current, appliedKeyword }),
    "refresh",
  ) ?? { state: current, request: null };
}

export function beginMaterialListLoad(
  current: MaterialListPageState,
  mode: "loadMore" | "refresh" | "retry",
): { state: MaterialListPageState; request: MaterialListRequest } | null {
  if (mode === "loadMore"
    && (current.pagination.status === "loading" || current.pagination.status === "end")) {
    return null;
  }
  if (mode === "retry" && current.pagination.status !== "error") return null;
  return beginWithKeyword(current, mode);
}

export function resolveMaterialListLoad(
  current: MaterialListPageState,
  request: MaterialListRequest,
  response: DouyinMaterialNotePublicPage,
): MaterialListPageState {
  const pagination = resolvePaginationRequest(current.pagination, request, {
    items: response.list,
    pagination: response.pagination,
  });
  if (pagination === current.pagination) return current;
  return withView({ ...current, pagination });
}

export function failMaterialListLoad(
  current: MaterialListPageState,
  request: MaterialListRequest,
): MaterialListPageState {
  const pagination = rejectPaginationRequest(current.pagination, request);
  if (pagination === current.pagination) return current;
  return withView({ ...current, pagination });
}

function beginWithKeyword(
  current: MaterialListPageState,
  mode: "loadMore" | "refresh" | "retry",
): { state: MaterialListPageState; request: MaterialListRequest } {
  const pending = beginPaginationRequest(current.pagination, mode);
  return {
    state: withView({ ...current, pagination: pending.state }),
    request: {
      ...pending.request,
      ...(current.appliedKeyword ? { keyword: current.appliedKeyword } : {}),
    },
  };
}

function withView(
  state: Omit<MaterialListPageState, "view"> & { view?: MaterialListView },
): MaterialListPageState {
  const { pagination } = state;
  return {
    ...state,
    view: {
      firstLoading: pagination.status === "loading" && pagination.items.length === 0,
      firstError: pagination.status === "error" && pagination.items.length === 0,
      empty: pagination.status === "end" && pagination.items.length === 0,
      paginationStatus: pagination.status,
    },
  };
}

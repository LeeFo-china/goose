import type {
  DouyinMaterialNoteOwnedPage,
  DouyinMaterialNoteOwnedSummary,
} from "../../models";
import {
  beginPaginationRequest,
  createPaginationState,
  rejectPaginationRequest,
  resolvePaginationRequest,
  type PaginationRequest,
  type PaginationState,
} from "../../utils/pagination";

export type OwnedMutationCommand =
  | { type: "remove"; claimId: string }
  | { type: "clear" };
export type OwnedMutationRequest = {
  sequence: number;
  command: OwnedMutationCommand;
};
export type OwnedMaterialPageState = {
  pagination: PaginationState<DouyinMaterialNoteOwnedSummary>;
  mutation: OwnedMutationRequest | null;
  mutationSequence: number;
  view: {
    firstLoading: boolean;
    firstError: boolean;
    empty: boolean;
    paginationStatus: PaginationState<DouyinMaterialNoteOwnedSummary>["status"];
  };
  navigationFor(item: DouyinMaterialNoteOwnedSummary): {
    kind: "owned";
    claimId: string;
  };
  reclaimNavigationFor(item: DouyinMaterialNoteOwnedSummary): {
    kind: "preview";
    id: string;
  };
};

export function createOwnedMaterialPageState(pageSize = 20): OwnedMaterialPageState {
  return withView({
    pagination: createPaginationState<DouyinMaterialNoteOwnedSummary>(pageSize),
    mutation: null,
    mutationSequence: 0,
  });
}

export function beginOwnedListLoad(
  current: OwnedMaterialPageState,
  mode: "loadMore" | "refresh" | "retry",
): { state: OwnedMaterialPageState; request: PaginationRequest } | null {
  if (mode === "loadMore"
    && (current.pagination.status === "loading" || current.pagination.status === "end")) {
    return null;
  }
  if (mode === "retry" && current.pagination.status !== "error") return null;
  const pending = beginPaginationRequest(current.pagination, mode);
  return {
    state: withView({ ...current, pagination: pending.state }),
    request: pending.request,
  };
}

export function resolveOwnedListLoad(
  current: OwnedMaterialPageState,
  request: PaginationRequest,
  response: DouyinMaterialNoteOwnedPage,
): OwnedMaterialPageState {
  const pagination = resolvePaginationRequest(current.pagination, request, {
    items: response.list,
    pagination: response.pagination,
  });
  if (pagination === current.pagination) return current;
  return withView({ ...current, pagination });
}

export function failOwnedListLoad(
  current: OwnedMaterialPageState,
  request: PaginationRequest,
): OwnedMaterialPageState {
  const pagination = rejectPaginationRequest(current.pagination, request);
  if (pagination === current.pagination) return current;
  return withView({ ...current, pagination });
}

export function beginOwnedMutation(
  current: OwnedMaterialPageState,
  command: OwnedMutationCommand,
): { state: OwnedMaterialPageState; request: OwnedMutationRequest } | null {
  if (current.mutation) return null;
  const request = { sequence: current.mutationSequence + 1, command };
  return {
    state: withView({
      ...current,
      mutation: request,
      mutationSequence: request.sequence,
    }),
    request,
  };
}

export function resolveOwnedMutation(
  current: OwnedMaterialPageState,
  request: OwnedMutationRequest,
): { state: OwnedMaterialPageState; shouldReload: boolean } {
  if (request.sequence !== current.mutation?.sequence) {
    return { state: current, shouldReload: false };
  }
  return {
    state: withView({ ...current, mutation: null }),
    shouldReload: true,
  };
}

export function failOwnedMutation(
  current: OwnedMaterialPageState,
  request: OwnedMutationRequest,
): OwnedMaterialPageState {
  if (request.sequence !== current.mutation?.sequence) return current;
  return withView({ ...current, mutation: null });
}

export function cancelOwnedMutation(
  current: OwnedMaterialPageState,
): OwnedMaterialPageState {
  if (!current.mutation) return current;
  return withView({
    ...current,
    mutation: null,
    mutationSequence: current.mutationSequence + 1,
  });
}

function withView(
  state: Omit<OwnedMaterialPageState, "view" | "navigationFor" | "reclaimNavigationFor">
    & Partial<Pick<OwnedMaterialPageState, "view" | "navigationFor" | "reclaimNavigationFor">>,
): OwnedMaterialPageState {
  return {
    ...state,
    view: {
      firstLoading: state.pagination.status === "loading"
        && state.pagination.items.length === 0,
      firstError: state.pagination.status === "error"
        && state.pagination.items.length === 0,
      empty: state.pagination.status === "end" && state.pagination.items.length === 0,
      paginationStatus: state.pagination.status,
    },
    navigationFor: (item) => ({ kind: "owned", claimId: item.claim_id }),
    reclaimNavigationFor: (item) => ({ kind: "preview", id: item.id }),
  };
}

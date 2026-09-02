import type {
  DouyinMaterialNoteBlock,
  DouyinMaterialNoteClaimResponse,
  DouyinMaterialNoteClaimedMaterial,
  DouyinMaterialNoteOwnedDetail,
  DouyinMaterialNotePreview,
} from "../../models";
import type { MaterialBusinessError } from "../../api/materials";

export type MaterialDetailTarget =
  | { kind: "preview"; id: string }
  | { kind: "owned"; claimId: string };
export type MaterialDetailStatus =
  | "idle"
  | "loading"
  | "preview"
  | "claiming"
  | "claimed"
  | "recovering"
  | "recovery-required"
  | "not-found"
  | "unavailable"
  | "withdrawn"
  | "error";
export type MaterialDetailContent = DouyinMaterialNoteClaimedMaterial & {
  claim_id: string;
  claimed_at: string;
};
export type MaterialDetailRequest = {
  kind: MaterialDetailTarget["kind"];
  sequence: number;
};
export type MaterialClaimRequest = { sequence: number };
export type MaterialDetailAuthority =
  | { kind: "detail"; request: MaterialDetailRequest }
  | { kind: "claim"; request: MaterialClaimRequest };
export type MaterialDetailState = {
  target: MaterialDetailTarget;
  status: MaterialDetailStatus;
  preview: DouyinMaterialNotePreview | null;
  content: MaterialDetailContent | null;
  claimId: string | null;
  requestSequence: number;
  claimSequence: number;
  activeClaimSequence: number | null;
  recoveringFromUncertain: boolean;
  shouldAutoResolveClaim: boolean;
};

export function createMaterialDetailState(target: MaterialDetailTarget): MaterialDetailState {
  return {
    target,
    status: "idle",
    preview: null,
    content: null,
    claimId: target.kind === "owned" ? target.claimId : null,
    requestSequence: 0,
    claimSequence: 0,
    activeClaimSequence: null,
    recoveringFromUncertain: false,
    shouldAutoResolveClaim: false,
  };
}

export function beginDetailLoad(current: MaterialDetailState): {
  state: MaterialDetailState;
  request: MaterialDetailRequest;
} {
  const sequence = current.requestSequence + 1;
  return {
    state: {
      ...current,
      status: "loading",
      content: null,
      activeClaimSequence: null,
      requestSequence: sequence,
      shouldAutoResolveClaim: false,
    },
    request: { kind: current.target.kind, sequence },
  };
}

export function resolveMaterialPreview(
  current: MaterialDetailState,
  request: MaterialDetailRequest,
  preview: DouyinMaterialNotePreview,
): MaterialDetailState {
  if (!matchesDetailRequest(current, request, "preview")) return current;
  if (!preview.claimed) {
    return {
      ...current,
      status: "preview",
      preview,
      content: null,
      claimId: null,
      recoveringFromUncertain: false,
      shouldAutoResolveClaim: false,
    };
  }
  return {
    ...current,
    status: "recovery-required",
    preview,
    content: null,
    shouldAutoResolveClaim: !current.recoveringFromUncertain,
    recoveringFromUncertain: false,
  };
}

export function resolveOwnedMaterial(
  current: MaterialDetailState,
  request: MaterialDetailRequest,
  detail: DouyinMaterialNoteOwnedDetail,
): MaterialDetailState {
  if (!matchesDetailRequest(current, request, "owned")) return current;
  return {
    ...current,
    status: "claimed",
    preview: null,
    content: {
      id: detail.id,
      version: detail.version,
      title: detail.title,
      summary: detail.summary,
      category: detail.category,
      applicable_to: detail.applicable_to,
      content_blocks: detail.content_blocks,
      claim_id: detail.claim_id,
      claimed_at: detail.claimed_at,
    },
    claimId: detail.claim_id,
    recoveringFromUncertain: false,
    shouldAutoResolveClaim: false,
  };
}

export function beginMaterialClaim(current: MaterialDetailState): {
  state: MaterialDetailState;
  request: MaterialClaimRequest;
} | null {
  if (current.target.kind !== "preview"
    || current.activeClaimSequence !== null
    || !["preview", "recovery-required"].includes(current.status)) return null;
  const sequence = current.claimSequence + 1;
  return {
    state: {
      ...current,
      status: "claiming",
      activeClaimSequence: sequence,
      claimSequence: sequence,
      shouldAutoResolveClaim: false,
    },
    request: { sequence },
  };
}

export function resolveMaterialClaim(
  current: MaterialDetailState,
  request: MaterialClaimRequest,
  response: DouyinMaterialNoteClaimResponse,
): MaterialDetailState {
  if (request.sequence !== current.activeClaimSequence) return current;
  return {
    ...current,
    status: "claimed",
    preview: null,
    content: {
      ...response.material,
      claim_id: response.claim_id,
      claimed_at: response.claimed_at,
    },
    claimId: response.claim_id,
    activeClaimSequence: null,
    recoveringFromUncertain: false,
    shouldAutoResolveClaim: false,
  };
}

export function failMaterialClaimUncertain(
  current: MaterialDetailState,
  request: MaterialClaimRequest,
): MaterialDetailState {
  if (request.sequence !== current.activeClaimSequence) return current;
  return {
    ...current,
    status: "recovering",
    content: null,
    activeClaimSequence: null,
    recoveringFromUncertain: true,
    shouldAutoResolveClaim: false,
  };
}

export function failDetailLoad(
  current: MaterialDetailState,
  request: MaterialDetailRequest,
): MaterialDetailState {
  if (!matchesDetailRequest(current, request, request.kind)) return current;
  return { ...current, status: "error", content: null, shouldAutoResolveClaim: false };
}

export function isCurrentDetailRequest(
  current: MaterialDetailState,
  request: MaterialDetailRequest,
): boolean {
  return matchesDetailRequest(current, request, request.kind);
}

export function resolveDetailBusinessError(
  current: MaterialDetailState,
  error: MaterialBusinessError,
  authority: MaterialDetailAuthority,
): MaterialDetailState {
  if (!matchesAuthority(current, authority)) return current;
  const status: MaterialDetailStatus = error.code === "MATERIAL_NOTE_WITHDRAWN"
    ? "withdrawn"
    : error.code === "MATERIAL_NOTE_NOT_AVAILABLE"
      ? "unavailable"
      : error.code === "MATERIAL_NOTE_NOT_FOUND"
        || error.code === "MATERIAL_NOTE_CLAIM_NOT_FOUND"
        ? "not-found"
        : "error";
  return {
    ...current,
    status,
    content: null,
    activeClaimSequence: null,
    shouldAutoResolveClaim: false,
  };
}

export function invalidateMaterialDetailState(
  current: MaterialDetailState,
): MaterialDetailState {
  return {
    ...current,
    status: "idle",
    preview: null,
    content: null,
    claimId: current.target.kind === "owned" ? current.target.claimId : null,
    requestSequence: current.requestSequence + 1,
    claimSequence: current.claimSequence + 1,
    activeClaimSequence: null,
    recoveringFromUncertain: false,
    shouldAutoResolveClaim: false,
  };
}

export function serializeMaterialBlocks(blocks: readonly DouyinMaterialNoteBlock[]): string {
  return blocks.map((block) => {
    switch (block.type) {
      case "heading":
      case "paragraph":
        return block.text;
      case "list":
        return block.items.map((item, index) =>
          block.style === "ordered" ? `${index + 1}. ${item}` : `• ${item}`).join("\n");
      case "quote":
        return `“${block.text}”${block.attribution ? `\n——${block.attribution}` : ""}`;
      case "callout":
        return `${block.title}\n${block.text}`;
      case "image":
        return [
          `[图片] ${block.asset.alt}`,
          block.caption ?? "",
          block.asset.src,
        ].filter(Boolean).join("\n");
    }
  }).join("\n\n");
}

function matchesDetailRequest(
  current: MaterialDetailState,
  request: MaterialDetailRequest,
  kind: MaterialDetailTarget["kind"],
): boolean {
  return request.sequence === current.requestSequence
    && request.kind === kind
    && current.target.kind === kind;
}

function matchesAuthority(
  current: MaterialDetailState,
  authority: MaterialDetailAuthority,
): boolean {
  return authority.kind === "detail"
    ? matchesDetailRequest(current, authority.request, authority.request.kind)
    : authority.request.sequence === current.activeClaimSequence;
}

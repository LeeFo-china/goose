import type { PublicCacheTiming } from "@/services/visitor-picture-public-cache";

export type CommentDebugTiming = Record<string, number | string | null>;

export function createAssetListTiming(): PublicCacheTiming {
  return {
    cache: null,
    total_ms: 0,
    query_ms: 0,
    visitor_state_ms: 0,
    serialize_ms: 0,
    row_count: 0,
    refresh_in_flight: false,
    shared_wait_ms: 0,
  };
}

export function createCategoryTiming(): PublicCacheTiming {
  return {
    cache: null,
    total_ms: 0,
    row_count: 0,
    refresh_in_flight: false,
    shared_wait_ms: 0,
  };
}

export function createNavigationTiming(): PublicCacheTiming {
  return {
    cache: null,
    total_ms: 0,
    query_ms: 0,
    visitor_state_ms: 0,
    serialize_ms: 0,
    row_count: 0,
    refresh_in_flight: false,
    shared_wait_ms: 0,
  };
}

export function createCommentTiming(): CommentDebugTiming {
  return {
    total_ms: 0,
    query_ms: 0,
    images_ms: 0,
    serialize_ms: 0,
    row_count: 0,
  };
}

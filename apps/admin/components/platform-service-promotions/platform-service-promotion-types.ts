export type PlatformServicePromotionVersionStatus =
  | "draft"
  | "published"
  | "superseded"
  | "stopped";

export type PlatformServicePromotionPhase =
  | "draft"
  | "scheduled"
  | "active"
  | "ended"
  | "stopped";

export type PlatformServicePromotionRecord = {
  id: string;
  code: string;
  draft_version_id: string | null;
  published_version_id: string | null;
  version: number;
  archived_at: string | null;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformServicePromotionVersion = {
  id: string;
  promotion_id: string;
  version_no: number;
  publication_status: PlatformServicePromotionVersionStatus;
  name: string;
  badge_text: string;
  title: string;
  summary: string;
  rules_text: string;
  discount_rate_basis_points: number;
  starts_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  published_by_employee_id: string | null;
  stopped_at: string | null;
  stopped_by_employee_id: string | null;
  stop_reason: string | null;
  created_at: string;
};

export type PlatformServicePromotionPricePreview = {
  product_id: string;
  code: string;
  title: string;
  term_years: number;
  list_amount_fen: number;
  base_amount_fen: number;
  effective_amount_fen: number;
  base_price_rate_basis_points: number;
  price_rate_basis_points: number;
};

export type PlatformServicePromotionListItem =
  PlatformServicePromotionRecord & {
    draft: PlatformServicePromotionVersion | null;
    published: PlatformServicePromotionVersion | null;
    phase: PlatformServicePromotionPhase;
    price_preview: PlatformServicePromotionPricePreview[];
  };

export type PlatformServicePromotionPage = {
  list: PlatformServicePromotionListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  server_time: string;
};

export type PlatformServicePromotionCommandResult = {
  idempotent: boolean;
  promotion: PlatformServicePromotionRecord;
  draft: PlatformServicePromotionVersion | null;
  published: PlatformServicePromotionVersion | null;
  price_preview: PlatformServicePromotionPricePreview[];
  server_time: string;
};

export type PlatformServicePromotionFormValues = {
  name: string;
  badgeText: string;
  title: string;
  summary: string;
  rulesText: string;
  discountRate: string;
  startsAt: string;
  endsAt: string;
};

export type PlatformServicePromotionCreatePayload = {
  name: string;
  badge_text: string;
  title: string;
  summary: string;
  rules_text: string;
  discount_rate_basis_points: number;
  starts_at: string | null;
  ends_at: string | null;
};

export type PlatformServicePromotionUpdatePayload =
  PlatformServicePromotionCreatePayload & {
    expected_version: number;
  };

export type PlatformServicePromotionPayload =
  | PlatformServicePromotionCreatePayload
  | PlatformServicePromotionUpdatePayload;

export type PlatformServicePromotionPayloadResult =
  | { ok: true; body: PlatformServicePromotionPayload }
  | { ok: false; message: string };

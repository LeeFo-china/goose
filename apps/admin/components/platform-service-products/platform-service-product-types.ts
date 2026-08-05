export type PageData<RecordType> = {
  list: RecordType[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type PlatformServiceProductStatus =
  | "draft"
  | "enabled"
  | "disabled"
  | "archived";

export type PlatformServiceProductVersionView = {
  id: string | null;
  version: number;
  title: string;
  term_years: number;
  list_amount_fen: number;
  amount_fen: number;
  price_rate_basis_points: number;
  service_scope: string[];
  terms_version: number;
  terms_content: string;
};

export type PlatformServiceProductListItem = {
  id: string;
  code: string;
  status: PlatformServiceProductStatus | string;
  version: number;
  published_version_id: string | null;
  sort_order: number;
  draft: PlatformServiceProductVersionView;
  published: PlatformServiceProductVersionView | null;
  has_unpublished_changes: boolean;
  created_at: string;
  updated_at: string;
};

export type PlatformServiceProductFormValues = {
  code: string;
  title: string;
  termYears: string;
  listAmountYuan: string;
  amountYuan: string;
  serviceScopeText: string;
  termsContent: string;
};

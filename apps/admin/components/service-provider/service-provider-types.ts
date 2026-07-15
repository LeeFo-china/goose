export type ServiceProviderPublicationStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "suspended";

export type ServiceProviderAreaStatus = "active" | "inactive";

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ListData<RecordType> = {
  list: RecordType[];
  pagination: Pagination;
};

export type ServiceProviderProfile = {
  id: string;
  tenant_id: string;
  public_name: string | null;
  introduction: string | null;
  public_phone: string | null;
  address_province: string | null;
  address_city: string | null;
  address_district: string | null;
  address_region_code: string | null;
  address: string | null;
  address_latitude: number | null;
  address_longitude: number | null;
  status: ServiceProviderPublicationStatus;
  version: number;
  submitted_at: string | null;
  reviewed_by_employee_id: string | null;
  reviewed_at: string | null;
  review_remark: string | null;
  published_at: string | null;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceProviderArea = {
  id: string;
  tenant_id: string;
  province: string | null;
  city: string;
  district: string | null;
  adcode: string;
  center_latitude: number | null;
  center_longitude: number | null;
  service_radius_km: number | null;
  priority: number;
  status: ServiceProviderAreaStatus;
  created_at: string;
  updated_at: string;
};

export type ServiceProviderMutationResult = {
  status: "updated";
  profile: ServiceProviderProfile;
  area?: ServiceProviderArea;
};

export type AdministrativeAreaOption = {
  adcode: string;
  name: string;
  level: "province" | "city" | "district";
  parent_adcode: string | null;
  full_name: string;
};

export type BadgeVariant =
  | "default"
  | "secondary"
  | "danger"
  | "outline"
  | "success"
  | "warning";

export const profileStatusMeta: Record<
  ServiceProviderPublicationStatus,
  { label: string; variant: BadgeVariant }
> = {
  draft: { label: "草稿", variant: "outline" },
  pending_review: { label: "待平台审核", variant: "warning" },
  published: { label: "公开展示中", variant: "success" },
  suspended: { label: "已暂停展示", variant: "danger" },
};

export const areaStatusMeta: Record<
  ServiceProviderAreaStatus,
  { label: string; variant: BadgeVariant }
> = {
  active: { label: "展示中", variant: "success" },
  inactive: { label: "未展示", variant: "outline" },
};

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatRegion(input: {
  address_province?: string | null;
  address_city?: string | null;
  address_district?: string | null;
}) {
  return [input.address_province, input.address_city, input.address_district]
    .filter(Boolean)
    .join(" ") || "-";
}

export function formatAreaRegion(input: {
  province?: string | null;
  city?: string | null;
  district?: string | null;
}) {
  return [input.province, input.city, input.district].filter(Boolean).join(" ");
}

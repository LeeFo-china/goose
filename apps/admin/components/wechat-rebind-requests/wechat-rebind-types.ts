export type WechatRebindStatus = "pending" | "approved" | "rejected" | "cancelled";

export type WechatRebindTargetRole = "customer" | "employee";

export type WechatRebindRequest = {
  id: string;
  tenant_id: string | null;
  target_role: WechatRebindTargetRole;
  target_customer_id: string | null;
  target_employee_id: string | null;
  phone_masked: string;
  applicant_name: string | null;
  project_hint: string | null;
  community_hint: string | null;
  remark: string | null;
  status: WechatRebindStatus;
  reviewer_employee_id: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WechatRebindPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type WechatRebindRequestListData = {
  list: WechatRebindRequest[];
  pagination: WechatRebindPagination;
};

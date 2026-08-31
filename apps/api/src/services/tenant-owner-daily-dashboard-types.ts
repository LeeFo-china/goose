export type TenantOwnerActionItem = {
  id: string;
  type: "approval" | "payment" | "acceptance" | "risk" | "customer";
  title: string;
  project_id: string | null;
  project_name: string | null;
  priority: "high" | "medium" | "low";
  target: {
    path: string;
    query?: Record<string, string>;
  };
};

export type TenantOwnerTopList<T> = {
  total: number;
  items: T[];
};

export type TenantOwnerBusinessDayRange = {
  businessDate: string;
  timezone: string;
  startAt: string;
  endAt: string;
};

export type TenantOwnerFinanceSnapshot = {
  today_income_amount: string;
  today_expense_amount: string;
  today_net_cash_amount: string;
  receivable_due_today_amount: string;
  receivable_due_7d_amount: string;
  overdue_receivable_amount: string;
  pending_supplier_payable_amount: string;
};

export type TenantOwnerProjectSnapshot = {
  active_project_count: number;
  advanced_today_count: number;
  started_today_count: number;
  completed_today_count: number;
  delayed_project_count: number;
  no_log_today_count: number;
  pending_acceptance_count: number;
};

export type TenantOwnerRiskProjectItem = {
  project_id: string;
  project_name: string;
  customer_name: string | null;
  current_node_title: string | null;
  risk_level: "high" | "warning";
  risk_types: string[];
  reason: string;
  owner_employee_name: string | null;
  updated_at: string;
  target: {
    path: string;
    query?: Record<string, string>;
  };
};

export type TenantOwnerConstructionActivity = {
  log_count: number;
  project_coverage_count: number;
  photo_count: number;
  latest_logs: Array<{
    log_id: string;
    project_id: string;
    project_name: string;
    stage_label: string | null;
    summary: string;
    image_count: number;
    created_at: string;
    employee_name: string | null;
  }>;
  missing_logs: Array<{
    project_id: string;
    project_name: string;
    current_node_title: string | null;
    assignee_employee_name: string | null;
  }>;
};

export type TenantOwnerCustomerFollowUpItem = {
  customer_id: string;
  customer_name: string;
  owner_employee_name: string | null;
  status_label: string | null;
  last_follow_up_at: string | null;
  next_follow_up_at: string | null;
  reason: string | null;
  target: {
    path: string;
    query?: Record<string, string | number | boolean | null>;
  } | null;
};

export type TenantOwnerCustomerFollowUpSnapshot = {
  total: number;
  due_today_count: number;
  overdue_count: number;
  completed_today_count: number;
  new_customer_count: number;
  items: TenantOwnerCustomerFollowUpItem[];
};

export type TenantOwnerGanttProjectRow = {
  id: string;
  name: string;
  customer_name: string | null;
  address_summary: string | null;
  owner_employee_name: string | null;
  status: string;
};

export type TenantOwnerGanttRiskSummary = {
  risk_level: "normal" | "warning" | "high";
  risk_types: string[];
  reason: string | null;
};

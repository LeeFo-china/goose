export interface TenantRenderingSettings {
  tenant_id: string;
  enabled: boolean;
  daily_task_limit: number | null;
  daily_budget_fen: number | null;
  per_job_reserve_fen: number | null;
  version: number;
  updated_at: string | null;
}

export interface TenantRenderingDailyUsage {
  budget_date: string;
  task_count: number;
  budget_used_fen: number;
}

export interface TenantRenderingAuditRecord {
  id: string;
  created_at: string;
  actor_employee?: { id: string; name: string | null } | null;
  metadata: unknown;
}

export interface TenantRenderingAuditPage {
  list: TenantRenderingAuditRecord[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

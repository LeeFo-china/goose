export type OpsScript = {
  key: string;
  label: string;
  description: string;
  timeout_ms: number;
  danger_level: "low" | "medium";
};

export type OpsScriptRun = {
  id: string;
  script_key: string;
  script_label: string;
  status: "running" | "success" | "failed" | "timeout";
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  duration_ms: number | null;
  executed_by_employee_id: string | null;
  reason: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  executed_by?: {
    id: string;
    name: string | null;
    phone: string | null;
  } | null;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type OpsSystemMetrics = {
  server: {
    cpu_usage_percent: number;
    memory: {
      total_mb: number;
      used_mb: number;
      free_mb: number;
      usage_percent: number;
    };
    disk: {
      total_mb: number;
      used_mb: number;
      available_mb: number;
      usage_percent: number;
    };
    load_average: number[];
  };
  checked_at: string;
};

export type OpsServiceHealth = {
  checked_at: string;
  docker_socket_path: string;
  summary: {
    total: number;
    running: number;
    healthy: number;
    unhealthy: number;
    starting: number;
    without_healthcheck: number;
    exited: number;
  };
  containers: Array<{
    id: string;
    name: string;
    image: string;
    group: "business" | "supabase" | "infrastructure";
    state: string;
    health: "healthy" | "unhealthy" | "starting" | "none" | "exited" | "unknown";
    status_text: string;
    started_at: string | null;
    ports: string[];
    restart_count: number | null;
    failing_streak: number | null;
    last_health_output: string | null;
  }>;
};

export type ReleaseEnvironment = "dev" | "production";

export type ReleaseService = "api" | "admin" | "social-video-worker" | "cos-reconcile-worker" | "all";

export type ReleaseRefType = "branch" | "tag" | "commit";

export type ReleaseRefOption = {
  value: string;
  label: string;
  description: string;
  type: ReleaseRefType;
  url?: string | null;
};

export type ReleaseOptionEnvironment = {
  environment: ReleaseEnvironment;
  label: string;
  workflow_id: string;
  default_ref: string;
  workflow_url: string;
  services: Array<{
    value: ReleaseService;
    label: string;
  }>;
};

export type ReleaseOptionsData = {
  configured: boolean;
  repository: string;
  environments: ReleaseOptionEnvironment[];
};

export type ReleaseRun = {
  id: string;
  environment: ReleaseEnvironment;
  workflow_id: string;
  workflow_label: string;
  title: string;
  status: string | null;
  conclusion: string | null;
  event: string | null;
  head_branch: string | null;
  head_sha: string | null;
  html_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  run_started_at: string | null;
};

export type ReleaseRunListData = {
  list: ReleaseRun[];
  pagination: Pagination;
};

export type ReleaseDispatchResult = {
  environment: ReleaseEnvironment;
  service: ReleaseService;
  service_label: string;
  ref: string;
  workflow_id: string;
  workflow_url: string;
  run: ReleaseRun | null;
  message: string;
};

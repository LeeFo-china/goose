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

export type LocationMetricsWindow = {
  window: "24h" | "7d";
  since: string;
  total: number;
  active: number;
  expired_unconfirmed: number;
  confirmed: number;
  confirmation_rate: number;
  single_tenant: number;
  multi_tenant: number;
  no_match: number;
  identity_match: number;
  raw_coordinate_stored: number;
  low_accuracy: number;
  source_counts: Record<string, number>;
  match_reason_counts: Record<string, number>;
  fallback_reason_counts: Record<string, number>;
};

export type LocationMetricsData = {
  generated_at: string;
  windows: LocationMetricsWindow[];
  recent_no_match: Array<{
    id: string;
    source: "gps" | "manual_city" | "manual_address";
    province: string | null;
    city: string | null;
    district: string | null;
    adcode: string | null;
    fallback_reason: string | null;
    created_at: string;
  }>;
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
    image_id: string | null;
    image_tag: string | null;
    labels: Record<string, string>;
    revision: string | null;
    build_ref: string | null;
    build_run_id: string | null;
    build_created_at: string | null;
    image_created_at: string | null;
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
export type ReleaseOperation = "release" | "rollback";
export type ReleaseMigrationMode = "plan" | "apply";
export type ReleaseStage =
  | "build_queued"
  | "building"
  | "build_failed"
  | "ready_to_deploy"
  | "deploy_queued"
  | "deploying"
  | "deploy_failed"
  | "deployed"
  | "legacy";

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
  production_migration?: {
    workflow_id: string;
    label: string;
    default_ref: string;
    workflow_url: string;
  };
};

export type ReleaseRun = {
  id: string;
  environment: ReleaseEnvironment;
  workflow_id: string;
  workflow_label: string;
  services: ReleaseService[] | null;
  service_label: string;
  stage: ReleaseStage;
  stage_label: string;
  legacy: boolean;
  audit: {
    id: string;
    summary: string | null;
    status: string | null;
    created_at: string;
    actor_employee_id: string | null;
    actor_user_id: string | null;
    actor_employee: {
      id: string;
      name: string | null;
      phone: string | null;
    } | null;
    reason: string | null;
    operation: string | null;
    operation_label: string | null;
    ref: string | null;
    ref_type_label: string | null;
    stage: string | null;
    commit_sha: string | null;
    build_run_id: string | null;
    workflow_url: string | null;
    run_id: string | null;
    run_url: string | null;
  } | null;
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

export type ReleaseSuccessfulRef = {
  id: string;
  environment: ReleaseEnvironment;
  workflow_id: string;
  workflow_label: string;
  title: string;
  ref: string;
  ref_type: "commit";
  label: string;
  description: string;
  head_branch: string | null;
  head_sha: string;
  html_url: string | null;
  created_at: string | null;
  run_started_at: string | null;
};

export type ReleaseSuccessfulRefListData = {
  list: ReleaseSuccessfulRef[];
  pagination: Pagination;
};

export type ReleaseRuntimeService = Exclude<ReleaseService, "all"> | "web";

export type ReleaseRuntimeServiceVersion = {
  environment: ReleaseEnvironment;
  service: ReleaseRuntimeService;
  service_label: string;
  container_name: string;
  image: string;
  image_tag: string | null;
  image_id: string | null;
  revision: string | null;
  revision_short: string | null;
  build_ref: string | null;
  build_run_id: string | null;
  build_created_at: string | null;
  image_created_at: string | null;
  state: string;
  health: OpsServiceHealth["containers"][number]["health"];
  started_at: string | null;
  latest_successful_dev_sha: string | null;
  latest_successful_prod_sha: string | null;
  diff_status: "same_as_dev" | "behind_dev" | "ahead_of_dev" | "unknown";
  diff_label: string;
};

export type ReleaseRuntimeVersionData = {
  checked_at: string;
  latest_successful: Record<ReleaseEnvironment, ReleaseSuccessfulRef | null>;
  services: ReleaseRuntimeServiceVersion[];
};

export type ProductionReleaseCandidate = {
  build_run_id: string;
  tag: string;
  commit_sha: string;
  services: Exclude<ReleaseService, "all">[];
  build_services: Array<"api" | "admin" | "social-video-worker">;
  target_environment: "production";
  manifest_verified: true;
  ready_to_deploy: boolean;
  already_deployed: boolean;
  blocked_reason: string | null;
  run_url: string | null;
  created_at: string | null;
};

export type ReleaseRunFailureSummary = {
  run_id: string;
  total_jobs: number;
  has_failure: boolean;
  summary: string;
  failed_jobs: Array<{
    id: string;
    name: string;
    status: string | null;
    conclusion: string | null;
    html_url: string | null;
    started_at: string | null;
    completed_at: string | null;
    failed_steps: Array<{
      name: string;
      number: number | null;
      status: string | null;
      conclusion: string | null;
      started_at: string | null;
      completed_at: string | null;
    }>;
  }>;
};

export type ReleaseCreateTagResult = {
  tag: string;
  ref_type: "tag";
  source_ref: string;
  target_sha: string;
  tag_sha: string;
  html_url: string;
  message: string;
  rollback?: boolean;
};

export type ReleaseDispatchResult = {
  environment: ReleaseEnvironment;
  service: ReleaseService;
  services?: ReleaseService[];
  service_label: string;
  ref: string;
  stage: "release" | "build" | "deploy";
  workflow_id: string;
  workflow_url: string;
  run: ReleaseRun | null;
  message: string;
};

export type ReleaseProductionMigrationDispatchResult = {
  mode: ReleaseMigrationMode;
  ref: string;
  ref_type: Exclude<ReleaseRefType, "commit">;
  workflow_id: string;
  workflow_url: string;
  run: ReleaseRun | null;
  message: string;
};

export type ReleaseProductionMigrationPrecheckResult = {
  run_id: string;
  run_url: string | null;
  status: string | null;
  conclusion: string | null;
  ready: boolean;
  needs_migration: boolean | null;
  mode: ReleaseMigrationMode | null;
  commit_sha: string | null;
  before_count: number | null;
  before_latest: string | null;
  after_count: number | null;
  after_latest: string | null;
  pending_count: number | null;
  pending_versions: string[];
  applied_count: number | null;
  applied_versions: string[];
  checked_at: string | null;
  message: string;
};

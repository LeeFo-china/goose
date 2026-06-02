import type {
  ReleaseCreateRollbackTagInput,
  ReleaseCreateTagInput,
  ReleaseDispatchInput,
  ReleaseEnvironment,
  ReleaseRefListQuery,
  ReleaseRefType,
  ReleaseRunListQuery,
  ReleaseSuccessfulRefListQuery,
  ReleaseService,
} from "@/schema/release-deployments";
import type { AuthContext } from "@/services/authorization";
import type { ServiceHealthContainer } from "@/services/docker-service-health";
import type {
  EmployeeLite,
  PlatformReleaseDispatchAuditRecord,
} from "@/repositories/platform-audit-logs";

export type GithubWorkflowRun = {
  id: number;
  name: string | null;
  display_title: string | null;
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

export type GithubWorkflowJobStep = {
  name: string | null;
  number: number | null;
  status: string | null;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type GithubWorkflowJob = {
  id: number;
  run_id: number;
  name: string | null;
  status: string | null;
  conclusion: string | null;
  html_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps?: GithubWorkflowJobStep[];
};

export type NormalizedReleaseRun = {
  id: string;
  environment: ReleaseEnvironment;
  workflow_id: string;
  workflow_label: string;
  services: ReleaseService[] | null;
  service_label: string;
  audit: ReleaseRunAudit | null;
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

export type ReleaseRunAudit = {
  id: string;
  summary: string | null;
  status: string | null;
  created_at: string;
  actor_employee_id: string | null;
  actor_user_id: string | null;
  actor_employee: EmployeeLite | null;
  reason: string | null;
  operation: string | null;
  operation_label: string | null;
  ref: string | null;
  ref_type_label: string | null;
  workflow_url: string | null;
  run_id: string | null;
  run_url: string | null;
};

export type SuccessfulReleaseRef = {
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

export type ReleaseRuntimeServiceVersion = {
  environment: ReleaseEnvironment;
  service: Exclude<ReleaseService, "all">;
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
  health: ServiceHealthContainer["health"];
  started_at: string | null;
  latest_successful_dev_sha: string | null;
  latest_successful_prod_sha: string | null;
  diff_status: "same_as_dev" | "behind_dev" | "ahead_of_dev" | "unknown";
  diff_label: string;
};

export type ReleaseRunFailureJobSummary = {
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
};

export type GithubBranch = {
  name: string;
  commit?: {
    sha?: string;
  };
};

export type GithubTag = {
  name: string;
  commit?: {
    sha?: string;
  };
};

export type GithubCommit = {
  sha: string;
  commit?: {
    message?: string;
    author?: {
      name?: string | null;
      date?: string | null;
    } | null;
  };
  html_url?: string | null;
};

export type GithubAnnotatedTag = {
  sha: string;
  tag: string;
  message: string;
  url: string;
};

export type GithubRef = {
  ref: string;
  url: string;
  object?: {
    sha?: string;
    type?: string;
    url?: string;
  };
};

export type ReleaseWorkflow = {
  environment: ReleaseEnvironment;
  workflowId: string;
  label: string;
  defaultRef: string;
  services: ReleaseService[];
};

export type {
  AuthContext,
  EmployeeLite,
  PlatformReleaseDispatchAuditRecord,
  ReleaseCreateRollbackTagInput,
  ReleaseCreateTagInput,
  ReleaseDispatchInput,
  ReleaseEnvironment,
  ReleaseRefListQuery,
  ReleaseRefType,
  ReleaseRunListQuery,
  ReleaseService,
  ReleaseSuccessfulRefListQuery,
  ServiceHealthContainer,
};

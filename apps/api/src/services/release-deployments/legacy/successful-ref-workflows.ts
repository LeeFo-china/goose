import {
  RELEASE_WORKFLOWS,
  type ReleaseEnvironment,
  type ReleaseWorkflow,
} from "./shared";

const AUTO_DEV_DEPLOY_WORKFLOW: ReleaseWorkflow = {
  environment: "dev",
  workflowId: "auto-deploy-dev.yml",
  label: "开发环境自动部署",
  defaultRef: "main",
  services: ["api", "admin", "social-video-worker", "cos-reconcile-worker", "billing-reconcile-worker"],
};

export function getSuccessfulRefWorkflows(environment?: ReleaseEnvironment): ReleaseWorkflow[] {
  if (environment === "dev") return [AUTO_DEV_DEPLOY_WORKFLOW, RELEASE_WORKFLOWS.dev];
  if (environment === "production") return [RELEASE_WORKFLOWS.production];
  return [AUTO_DEV_DEPLOY_WORKFLOW, ...Object.values(RELEASE_WORKFLOWS)];
}

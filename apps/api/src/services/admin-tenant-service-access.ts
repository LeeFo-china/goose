import {
  AdminTenantServiceAccessSchema,
  type AdminServiceAccessAction,
  type AdminTenantServiceAccess,
  type EmployeeServiceAccessAction,
  type EmployeeServiceAccessSummary,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import { employeeServiceAccessService } from "@/services/employee-service-access";

const ACTION_PERMISSIONS = {
  apply_trial: "billing.service_trial.apply",
  view_trial: "billing.service_trial.read",
  purchase_service: "billing.service_order.create",
} as const;

const CONTACT_TENANT_ADMIN_ACTION: AdminServiceAccessAction = {
  key: "contact_tenant_admin",
  label: "联系企业管理员",
};

const CONTACT_PLATFORM_ACTION: AdminServiceAccessAction = {
  key: "contact_platform",
  label: "联系平台",
};

const REFRESH_ACTION: AdminServiceAccessAction = {
  key: "refresh",
  label: "刷新状态",
};

export type AdminTenantServiceAccessInput = {
  tenantId: string;
  permissionCodes: readonly string[];
};

export type ResolveEmployeeAccess = (
  input: AdminTenantServiceAccessInput,
) => Promise<EmployeeServiceAccessSummary>;

export type AdminTenantServiceAccessServiceDependencies = {
  resolveEmployeeAccess?: ResolveEmployeeAccess;
};

export class AdminTenantServiceAccessService {
  private readonly resolveEmployeeAccess: ResolveEmployeeAccess;

  constructor(dependencies: AdminTenantServiceAccessServiceDependencies = {}) {
    this.resolveEmployeeAccess = dependencies.resolveEmployeeAccess
      ?? ((input) => employeeServiceAccessService.resolve(input));
  }

  async resolve(
    input: AdminTenantServiceAccessInput,
  ): Promise<AdminTenantServiceAccess> {
    const employeeAccess = await this.resolveEmployeeAccess(input);
    const [primaryAction, secondaryAction] = projectActions(
      employeeAccess,
      input.permissionCodes,
    );
    const projected = AdminTenantServiceAccessSchema.safeParse({
      accessStatus: employeeAccess.access_status,
      accessMode: employeeAccess.access_mode,
      accessLevel: employeeAccess.access_level,
      canEnterWorkspace: employeeAccess.can_enter_workspace,
      readonly: employeeAccess.readonly,
      trialId: employeeAccess.trial_id,
      trialStatus: employeeAccess.trial_status,
      startsAt: employeeAccess.starts_at,
      endsAt: employeeAccess.ends_at,
      evaluatedAt: employeeAccess.evaluated_at,
      title: employeeAccess.title,
      message: employeeAccess.message,
      primaryAction,
      secondaryAction,
    });

    if (!projected.success) {
      throw Errors.dbError("Admin 服务访问事实不一致");
    }

    return projected.data;
  }
}

export const adminTenantServiceAccessService =
  new AdminTenantServiceAccessService();

function projectActions(
  summary: EmployeeServiceAccessSummary,
  permissionCodes: readonly string[],
): readonly [
  AdminServiceAccessAction | null,
  AdminServiceAccessAction | null,
] {
  const sourceActions = [summary.primary_action, summary.secondary_action]
    .filter((item): item is EmployeeServiceAccessAction => item !== null);

  if (summary.access_status === "hard_blocked") {
    return [
      findAction(sourceActions, "contact_platform") ?? CONTACT_PLATFORM_ACTION,
      findAction(sourceActions, "refresh") ?? REFRESH_ACTION,
    ];
  }

  if (summary.access_status === "workspace_available") {
    return [
      findAction(sourceActions, "enter_workspace"),
      hasPermission(permissionCodes, ACTION_PERMISSIONS.view_trial)
        ? findAction(sourceActions, "view_trial")
        : null,
    ];
  }

  if (summary.access_status === "grace_period") {
    return [
      findAction(sourceActions, "enter_readonly_workspace"),
      hasPermission(permissionCodes, ACTION_PERMISSIONS.purchase_service)
        ? findAction(sourceActions, "purchase_service")
        : null,
    ];
  }

  return projectBlockedActions(sourceActions, permissionCodes);
}

function projectBlockedActions(
  sourceActions: readonly EmployeeServiceAccessAction[],
  permissionCodes: readonly string[],
): readonly [AdminServiceAccessAction, AdminServiceAccessAction] {
  const recoveryActions = sourceActions
    .filter((source) => isPermittedRecoveryAction(source, permissionCodes))
    .map(projectAction);
  const refreshAction = findAction(sourceActions, "refresh");

  if (recoveryActions.length === 0) {
    return [CONTACT_TENANT_ADMIN_ACTION, refreshAction ?? REFRESH_ACTION];
  }

  if (recoveryActions.length === 1) {
    return [
      recoveryActions[0]!,
      refreshAction ?? CONTACT_TENANT_ADMIN_ACTION,
    ];
  }

  return [recoveryActions[0]!, recoveryActions[1]!];
}

function isPermittedRecoveryAction(
  action: EmployeeServiceAccessAction,
  permissionCodes: readonly string[],
) {
  if (action.key !== "apply_trial"
    && action.key !== "view_trial"
    && action.key !== "purchase_service") {
    return false;
  }

  return hasPermission(permissionCodes, ACTION_PERMISSIONS[action.key]);
}

function hasPermission(
  permissionCodes: readonly string[],
  permission: string,
) {
  return permissionCodes.includes(permission);
}

function findAction(
  actions: readonly EmployeeServiceAccessAction[],
  key: EmployeeServiceAccessAction["key"],
) {
  const source = actions.find((item) => item.key === key);
  return source ? projectAction(source) : null;
}

function projectAction(
  source: EmployeeServiceAccessAction,
): AdminServiceAccessAction {
  return { key: source.key, label: source.label };
}

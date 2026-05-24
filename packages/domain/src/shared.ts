export { AI_MESSAGE_ROLE_VALUES } from './ai';
export type { AiMessageRole } from './ai';

export {
  AUTH_TARGET_ROLE_VALUES,
  SMS_SCENE_VALUES,
  SMS_VERIFICATION_STATUS_VALUES,
} from './auth';
export type {
  AuthTargetRole,
  SmsScene,
  SmsVerificationStatus,
} from './auth';

export {
  CUSTOMER_ORIGIN_VALUES,
  CUSTOMER_SOURCE_VALUES,
  CUSTOMER_STATUS_VALUES,
} from './customer';
export type { CustomerOrigin, CustomerSource, CustomerStatus } from './customer';

export { DEPARTMENT_CODE_VALUES } from './department';
export type { DepartmentCode } from './department';

export { EMPLOYEE_ROLE_VALUES, EMPLOYEE_STATUS_VALUES } from './employee';
export type { EmployeeRole, EmployeeStatus } from './employee';

export {
  EXPENSE_APPROVAL_ACTION_VALUES,
  EXPENSE_MODE_VALUES,
  EXPENSE_REQUEST_STEP_VALUES,
  EXPENSE_SETTLEMENT_METHOD_VALUES,
  EXPENSE_STATUS_VALUES,
} from './expense';
export type {
  ExpenseApprovalAction,
  ExpenseMode,
  ExpenseRequestStep,
  ExpenseSettlementMethod,
  ExpenseStatus,
} from './expense';

export {
  MARKETING_PAGE_BLOCK_TYPE_VALUES,
  MARKETING_PAGE_EVENT_NAME_VALUES,
  MARKETING_PAGE_STATUS_VALUES,
  MARKETING_PAGE_VERSION_STATUS_VALUES,
} from './marketing-page';
export type {
  MarketingPageBlockType,
  MarketingPageEventName,
  MarketingPageStatus,
  MarketingPageVersionStatus,
} from './marketing-page';

export { PAYMENT_STATUS_VALUES, PAYMENT_TYPE_VALUES } from './payment';
export type { PaymentStatus, PaymentType } from './payment';

export {
  ACCESS_SCOPE_VALUES,
  AccessScopeConfig,
  PERMISSION_CODE_VALUES,
  PermissionCodeConfig,
  PERMISSION_OVERRIDE_EFFECT_VALUES,
  PERMISSION_STATUS_VALUES,
  PermissionStatusConfig,
  ROLE_STATUS_VALUES,
  RoleStatusConfig,
} from './permission';
export type {
  AccessScope,
  PermissionCode,
  PermissionOverrideEffect,
  PermissionStatus,
  RoleStatus,
} from './permission';

export {
  EMPLOYEE_POST_CODE_VALUES,
  EmployeePostConfig,
  POST_CODE_VALUES,
  POST_STATUS_VALUES,
  PostConfig,
  SALARY_TYPE_VALUES,
  isEmployeePostCode,
  isPostCode,
} from './post';
export type { EmployeePostCode, PostCode, PostStatus, SalaryType } from './post';

export {
  PROJECT_ACCEPTANCE_ACTION_VALUES,
  PROJECT_ACCEPTANCE_FLOW_MODE_VALUES,
  PROJECT_ACCEPTANCE_ITEM_RESULT_VALUES,
  PROJECT_ACCEPTANCE_REJECT_SOURCE_VALUES,
  PROJECT_ACCEPTANCE_STAGE_LABELS,
  PROJECT_ACCEPTANCE_STATUS_VALUES,
  ProjectAcceptanceStatusConfig,
  isProjectAcceptanceAction,
  isProjectAcceptanceItemResult,
  isProjectAcceptanceStatus,
} from './project-acceptance';
export type {
  ProjectAcceptanceAction,
  ProjectAcceptanceFlowMode,
  ProjectAcceptanceItemResult,
  ProjectAcceptanceRejectSource,
  ProjectAcceptanceStatus,
  ProjectAcceptanceStatusConfigItem,
} from './project-acceptance';

export {
  PROJECT_CONSTRUCTION_AUXILIARY_STAGE_CODE_VALUES,
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
  PROJECT_CONSTRUCTION_STAGE_STATUS_VALUES,
  PROJECT_LOG_COMMENT_AUTHOR_TYPE_VALUES,
  PROJECT_LOG_STAGE_CODE_VALUES,
  PROJECT_LOG_STAGE_CONFIG,
  getPreviousProjectConstructionStage,
  isProjectConstructionStageCode,
  isProjectLogStageCode,
} from './project-log';
export type {
  ProjectConstructionStageCode,
  ProjectConstructionStageStatus,
  ProjectLogCommentAuthorType,
  ProjectLogStageCode,
  ProjectLogStageConfigItem,
} from './project-log';

export {
  PROJECT_CREATE_EMPLOYEE_SCENE_VALUES,
  PROJECT_MEMBER_ROLE_CODE_VALUES,
  PROJECT_MEMBER_ROLE_CONFIG,
  PROJECT_STATUS_VALUES,
  PROJECT_VISIBILITY_STATUS_VALUES,
  isProjectMemberRoleCode,
} from './project';
export type {
  ProjectCreateEmployeeScene,
  ProjectMemberRoleCode,
  ProjectMemberRoleConfigItem,
  ProjectStatus,
  ProjectVisibilityStatus,
} from './project';

export {
  EXTERNAL_REFERRER_STATUS_VALUES,
  PROJECT_REFERRAL_RATE_BPS_MAX,
  PROJECT_REFERRAL_RATE_BPS_MIN,
  PROJECT_REFERRAL_STATUS_VALUES,
} from './referral';
export type {
  ExternalReferrerStatus,
  ProjectReferralStatus,
} from './referral';

export { TENANT_STATUS_VALUES, isTenantStatus } from './tenant';
export type { TenantBasicInfo, TenantStatus } from './tenant';

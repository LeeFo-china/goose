import { assertTargetMatchesPhone } from "./assertions";
import { serializeRequest } from "./serialize";
import {
  ErrorCodes,
  Errors,
  accessPolicyService,
  authorizationService,
  isEmployeeOperableStatus,
  maskPhone,
  normalizeNullableText,
  platformAuditLogService,
  userIdentityService,
  wechatRebindRequestRepository,
  type AuthContext,
  type ReviewWechatRebindRequestInput,
  type WechatRebindRequestRecord,
} from "./shared";

async function getReviewTarget(record: WechatRebindRequestRecord) {
  if (!record.tenant_id) {
    throw Errors.badRequest("换绑申请缺少租户上下文");
  }

  return record.target_role === "customer"
    ? await wechatRebindRequestRepository.findCustomer(
      record.target_customer_id!,
      record.tenant_id,
    )
    : await wechatRebindRequestRepository.findEmployee(
      record.target_employee_id!,
      record.tenant_id,
    );
}

function assertReviewerCanReview(authContext: AuthContext, record: WechatRebindRequestRecord) {
  accessPolicyService.assertPermission(authContext, "customer.update");
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  if (record.tenant_id !== tenantId) {
    throw Errors.forbidden();
  }
}

export async function approve(
  authContext: AuthContext,
  id: string,
  input: ReviewWechatRebindRequestInput,
) {
  const record = await wechatRebindRequestRepository.findById(id);
  if (!record) {
    throw Errors.notFound("换绑申请不存在");
  }
  assertReviewerCanReview(authContext, record);
  if (record.status !== "pending") {
    throw Errors.badRequest("换绑申请已处理");
  }

  const target = await getReviewTarget(record);
  assertTargetMatchesPhone(target, record.phone, record.target_role);

  if (target?.user_id !== record.old_auth_user_id) {
    throw Errors.badRequest("目标身份绑定关系已变化，无法完成换绑");
  }

  if (record.target_role === "employee" && !isEmployeeOperableStatus(target?.status)) {
    throw Errors.badRequest("目标员工账号已停用，无法换绑");
  }

  const updatedTarget = record.target_role === "customer"
    ? await wechatRebindRequestRepository.updateCustomerUserId({
      customerId: record.target_customer_id!,
      tenantId: record.tenant_id!,
      phone: record.phone,
      oldAuthUserId: record.old_auth_user_id!,
      authUserId: record.new_auth_user_id,
    })
    : await wechatRebindRequestRepository.updateEmployeeUserId({
      employeeId: record.target_employee_id!,
      tenantId: record.tenant_id!,
      phone: record.phone,
      oldAuthUserId: record.old_auth_user_id!,
      authUserId: record.new_auth_user_id,
    });

  if (!updatedTarget) {
    throw Errors.badRequest("目标身份已变化，无法完成换绑");
  }

  await userIdentityService.transferBusinessMembershipBestEffort({
    oldUserId: record.old_auth_user_id,
    newUserId: record.new_auth_user_id,
    tenantId: record.tenant_id,
    identityType: record.target_role,
    identityId: record.target_role === "customer"
      ? record.target_customer_id!
      : record.target_employee_id!,
    source: "wechat_rebind_approve",
  });

  const reviewed = await wechatRebindRequestRepository.review({
    id,
    status: "approved",
    reviewerEmployeeId: authContext.employeeId,
    comment: normalizeNullableText(input.comment),
  });
  if (!reviewed) {
    throw Errors.badRequest("换绑申请已处理");
  }

  authorizationService.invalidateAuthContext({ authUserId: record.old_auth_user_id });
  authorizationService.invalidateAuthContext({ authUserId: record.new_auth_user_id });
  await platformAuditLogService.recordBestEffort({
    action: "wechat_rebind_approve",
    actorEmployeeId: authContext.employeeId,
    actorUserId: authContext.authUserId,
    targetTenantId: record.tenant_id,
    resourceType: "wechat_rebind_request",
    resourceId: record.id,
    resourceLabel: maskPhone(record.phone),
    summary: "审核通过微信换绑申请",
    metadata: {
      target_role: record.target_role,
      target_customer_id: record.target_customer_id,
      target_employee_id: record.target_employee_id,
    },
  });

  return serializeRequest(reviewed);
}

export async function reject(
  authContext: AuthContext,
  id: string,
  input: ReviewWechatRebindRequestInput,
) {
  const record = await wechatRebindRequestRepository.findById(id);
  if (!record) {
    throw Errors.notFound("换绑申请不存在");
  }
  assertReviewerCanReview(authContext, record);
  if (record.status !== "pending") {
    throw Errors.badRequest("换绑申请已处理");
  }

  const reviewed = await wechatRebindRequestRepository.review({
    id,
    status: "rejected",
    reviewerEmployeeId: authContext.employeeId,
    comment: normalizeNullableText(input.comment),
  });
  if (!reviewed) {
    throw Errors.badRequest("换绑申请已处理");
  }

  await platformAuditLogService.recordBestEffort({
    action: "wechat_rebind_reject",
    actorEmployeeId: authContext.employeeId,
    actorUserId: authContext.authUserId,
    targetTenantId: record.tenant_id,
    resourceType: "wechat_rebind_request",
    resourceId: record.id,
    resourceLabel: maskPhone(record.phone),
    summary: "拒绝微信换绑申请",
    metadata: {
      target_role: record.target_role,
      target_customer_id: record.target_customer_id,
      target_employee_id: record.target_employee_id,
    },
  });

  return serializeRequest(reviewed);
}

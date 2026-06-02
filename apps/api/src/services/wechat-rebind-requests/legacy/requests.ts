import {
  assertTargetCanRequestRebind,
  assertTargetMatchesPhone,
} from "./assertions";
import { serializeRequest } from "./serialize";
import { markVerificationCodeVerified, verifyRebindCode } from "./verification";
import {
  ErrorCodes,
  Errors,
  accessPolicyService,
  normalizeNullableText,
  wechatRebindRequestRepository,
  type AuthContext,
  type WechatRebindRequestInput,
  type WechatRebindRequestListQuery,
} from "./shared";

export async function create(authUserId: string | null | undefined, input: WechatRebindRequestInput) {
  if (!authUserId) {
    throw Errors.unauthorized("请先登录", ErrorCodes.UNAUTHORIZED);
  }

  const verification = await verifyRebindCode(input.phone, input.code);
  const target = input.target_role === "customer"
    ? await wechatRebindRequestRepository.findCustomer(input.customer_id!, input.tenant_id)
    : await wechatRebindRequestRepository.findEmployee(input.employee_id!, input.tenant_id);

  assertTargetMatchesPhone(target, input.phone, input.target_role);
  assertTargetCanRequestRebind(target!, authUserId, input.target_role);

  const duplicate = await wechatRebindRequestRepository.findPendingDuplicate({
    phone: input.phone,
    targetRole: input.target_role,
    targetCustomerId: input.customer_id ?? null,
    targetEmployeeId: input.employee_id ?? null,
  });
  if (duplicate) {
    throw Errors.badRequest("该手机号已有待审核换绑申请，请勿重复提交");
  }

  const record = await wechatRebindRequestRepository.create({
    tenantId: input.tenant_id,
    targetRole: input.target_role,
    targetCustomerId: input.target_role === "customer" ? input.customer_id : null,
    targetEmployeeId: input.target_role === "employee" ? input.employee_id : null,
    phone: input.phone,
    oldAuthUserId: target!.user_id!,
    newAuthUserId: authUserId,
    applicantName: normalizeNullableText(input.applicant_name),
    projectHint: normalizeNullableText(input.project_hint),
    communityHint: normalizeNullableText(input.community_hint),
    remark: normalizeNullableText(input.remark),
  });

  if (verification) {
    await markVerificationCodeVerified(verification.id);
  }

  return {
    id: record.id,
    status: record.status,
    message: "换绑申请已提交，请等待工作人员审核",
  };
}

export async function list(authContext: AuthContext, query: WechatRebindRequestListQuery) {
  accessPolicyService.assertPermission(authContext, "customer.update");
  const tenantId = accessPolicyService.assertTenantContext(authContext);

  const data = await wechatRebindRequestRepository.list({
    tenantId,
    status: query.status,
    page: query.page,
    pageSize: query.pageSize,
  });

  return {
    list: data.list.map((item) => serializeRequest(item)),
    pagination: data.pagination,
  };
}

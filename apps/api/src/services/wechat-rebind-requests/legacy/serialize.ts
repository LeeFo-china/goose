import {
  maskPhone,
  type WechatRebindRequestRecord,
} from "./shared";

export function serializeRequest(record: WechatRebindRequestRecord) {
  return {
    id: record.id,
    tenant_id: record.tenant_id,
    target_role: record.target_role,
    target_customer_id: record.target_customer_id,
    target_employee_id: record.target_employee_id,
    phone_masked: maskPhone(record.phone),
    applicant_name: record.applicant_name,
    project_hint: record.project_hint,
    community_hint: record.community_hint,
    remark: record.remark,
    status: record.status,
    reviewer_employee_id: record.reviewer_employee_id,
    review_comment: record.review_comment,
    reviewed_at: record.reviewed_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

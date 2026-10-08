import { serializeStoredCandidate } from "../../apps/api/src/services/phone-identity-login/helpers";
import type { PhoneIdentityCandidate } from "../../apps/api/src/services/phone-identity-login/types";

// Synthetic identities used only by supabase/tests/phone_identity_selection.sql.
const common = {
  bindingState: "bindable" as const,
  tenantId: "00000000-0000-4000-8000-000000000101",
  customerId: null,
  employeeId: null,
  partnerId: null,
  partnerMemberId: null,
  title: "手机号登录回归",
  sharePreferred: false,
};
const candidates: PhoneIdentityCandidate[] = [
  {
    ...common,
    candidateId: "00000000-0000-4000-8000-000000000105",
    targetMode: "customer",
    customerId: "00000000-0000-4000-8000-000000000102",
    roleLabel: "客户",
    subtitle: "登录回归客户",
  },
  {
    ...common,
    candidateId: "00000000-0000-4000-8000-000000000106",
    targetMode: "tenant_employee",
    employeeId: "00000000-0000-4000-8000-000000000103",
    roleLabel: "员工",
    subtitle: "登录回归员工",
  },
];

process.stdout.write(JSON.stringify(candidates.map(serializeStoredCandidate)));

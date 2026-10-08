import {
  wechatEmployeeIdentityRepository,
  type WechatEmployeeIdentityRow,
} from "@/repositories/wechat-employee-identities";

class WechatEmployeeIdentityService {
  listEmployeeLoginCandidatesByPhone(phone: string) {
    return wechatEmployeeIdentityRepository.listEmployeeLoginCandidatesByPhone(
      phone,
    );
  }

  getEmployeeLoginCandidateById(employeeId: string) {
    return wechatEmployeeIdentityRepository.getEmployeeLoginCandidateById(
      employeeId,
    );
  }

  bindEmployeeAuthUser(input: {
    employeeId: string;
    authUserId: string;
    expected: Pick<WechatEmployeeIdentityRow, "phone" | "version" | "user_id" | "tenant_id" | "status">;
    errorMessage?: string;
  }) {
    return wechatEmployeeIdentityRepository.bindEmployeeAuthUser(input);
  }

  clearOtherEmployeeBindings(input: {
    authUserId: string;
    exceptEmployeeId: string;
  }) {
    return wechatEmployeeIdentityRepository.clearOtherEmployeeBindings(input);
  }
}

export type EmployeeIdentityRow = WechatEmployeeIdentityRow;

export const wechatEmployeeIdentityService =
  new WechatEmployeeIdentityService();

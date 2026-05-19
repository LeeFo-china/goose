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

  bindEmployeeAuthUser(input: {
    employeeId: string;
    authUserId: string;
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

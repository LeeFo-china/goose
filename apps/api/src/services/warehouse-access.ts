import { accessPolicyService } from "@/services/access-policy";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

type WarehouseAccessScope = {
  tenantId: string;
  actorUserId: string;
  actorEmployeeId: string;
};

class WarehouseAccessService {
  requireRead(auth: AuthContext): WarehouseAccessScope {
    return this.requireScope(auth, "inventory.warehouse.view");
  }

  requireManage(auth: AuthContext): WarehouseAccessScope {
    return this.requireScope(auth, "inventory.warehouse.manage");
  }

  private requireScope(
    auth: AuthContext,
    permissionCode: string,
  ): WarehouseAccessScope {
    const tenantId = accessPolicyService.assertTenantContext(auth);
    accessPolicyService.assertPermission(auth, permissionCode);
    if (!auth.employeeId) {
      throw Errors.business(
        403,
        "当前操作需要员工身份",
        "EMPLOYEE_CONTEXT_REQUIRED",
      );
    }

    return {
      tenantId,
      actorUserId: auth.authUserId,
      actorEmployeeId: auth.employeeId,
    };
  }
}

export const warehouseAccessService = new WarehouseAccessService();
export { WarehouseAccessService };

import { describe, expect, test } from "bun:test";
import {
  buildPermissionTree,
  getPermissionGroupCheckState,
  getPermissionSelectionDelta,
} from "./role-permission-tree";
import type { AccessScope, PermissionRecord } from "./role-mutation-shared";

const permissions: PermissionRecord[] = [
  {
    id: "customer-read",
    code: "customer.read",
    name: "查看客户",
    module: "customer",
    resource: "customer",
    action: "read",
    description: null,
  },
  {
    id: "customer-create",
    code: "customer.create",
    name: "新建客户",
    module: "customer",
    resource: "customer",
    action: "create",
    description: null,
  },
  {
    id: "customer-phone-copy",
    code: "customer_phone.copy",
    name: "复制手机号",
    module: "customer",
    resource: "customer_phone",
    action: "copy",
    description: null,
  },
  {
    id: "finance-payment-confirm",
    code: "finance.payment.confirm",
    name: "确认项目收款",
    module: "finance",
    resource: "payment",
    action: "confirm",
    description: null,
  },
];

describe("role permission tree", () => {
  test("groups permissions by module and resource with selection counts", () => {
    const selected: Record<string, AccessScope> = {
      "customer-read": "self",
      "customer-phone-copy": "all",
    };

    const tree = buildPermissionTree(permissions, selected);

    expect(tree).toHaveLength(2);
    expect(tree[0].key).toBe("customer");
    expect(tree[0].label).toBe("客户管理");
    expect(tree[0].selected).toBe(2);
    expect(tree[0].total).toBe(3);
    expect(tree[0].resources.map((resource) => resource.key)).toEqual([
      "customer::customer",
      "customer::customer_phone",
    ]);
    expect(tree[0].resources[0].label).toBe("客户");
    expect(tree[0].resources[0].selected).toBe(1);
    expect(tree[0].resources[0].total).toBe(2);
    expect(tree[1].label).toBe("财务管理");
  });

  test("returns checkbox states for full, partial and empty groups", () => {
    expect(
      getPermissionGroupCheckState(permissions.slice(0, 2), {
        "customer-read": "self",
        "customer-create": "all",
      }),
    ).toBe("checked");
    expect(
      getPermissionGroupCheckState(permissions.slice(0, 2), {
        "customer-read": "self",
      }),
    ).toBe("indeterminate");
    expect(getPermissionGroupCheckState(permissions.slice(0, 2), {})).toBe("unchecked");
  });

  test("summarizes added, removed and scope-changed permissions", () => {
    const initial: Record<string, AccessScope> = {
      "customer-read": "self",
      "customer-create": "self",
      "customer-phone-copy": "department",
    };
    const current: Record<string, AccessScope> = {
      "customer-read": "all",
      "customer-phone-copy": "department",
      "finance-payment-confirm": "self",
    };

    expect(getPermissionSelectionDelta(initial, current)).toEqual({
      added: 1,
      removed: 1,
      scopeChanged: 1,
      hasChanges: true,
    });
  });
});

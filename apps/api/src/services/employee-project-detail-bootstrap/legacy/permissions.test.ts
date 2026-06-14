import { describe, expect, test } from "bun:test";
import {
  buildPermissionsFromKnownData,
} from "./permissions";

function makeService(permissionAccess: Record<string, boolean>) {
  return {
    buildPermissionsFromKnownData,
    canAccessKnownProjectByPermission(
      _authContext: unknown,
      _project: unknown,
      _members: unknown,
      permissionCode: string,
    ) {
      return Promise.resolve(Boolean(permissionAccess[permissionCode]));
    },
    canWriteKnownProjectLog() {
      return Promise.resolve(false);
    },
    canAccessKnownProjectByOptionalPermission(
      authContext: unknown,
      project: unknown,
      members: unknown,
      permissionCodes: string[],
    ) {
      return Promise.all(
        permissionCodes.map((permissionCode) =>
          this.canAccessKnownProjectByPermission(
            authContext,
            project,
            members,
            permissionCode,
          )
        ),
      ).then((results) => results.some(Boolean));
    },
  };
}

function authContext(permissionCodes: string[]) {
  return {
    employeeId: "employee-1",
    permissions: permissionCodes.map((code) => ({ code, scope: "self" })),
  };
}

const project = {
  id: "project-1",
  tenant_id: "tenant-1",
};

describe("employee project detail bootstrap referral permissions", () => {
  test("uses project_referral.read for read-only referral visibility", async () => {
    const permissions = await makeService({
      "project.update": true,
      "project_referral.read": true,
      "project_referral.manage": false,
    }).buildPermissionsFromKnownData({
      authContext: authContext([
        "project.update",
        "project_referral.read",
      ]) as never,
      project,
      storedMembers: [] as never,
      rawMembers: [],
    });

    expect(permissions.can_update_project).toBe(true);
    expect(permissions.can_view_project_referral).toBe(true);
    expect(permissions.can_manage_project_referral).toBe(false);
  });

  test("treats project_referral.manage as referral read and manage access", async () => {
    const permissions = await makeService({
      "project.update": false,
      "project_referral.read": false,
      "project_referral.manage": true,
    }).buildPermissionsFromKnownData({
      authContext: authContext([
        "project_referral.manage",
      ]) as never,
      project,
      storedMembers: [] as never,
      rawMembers: [],
    });

    expect(permissions.can_update_project).toBe(false);
    expect(permissions.can_view_project_referral).toBe(true);
    expect(permissions.can_manage_project_referral).toBe(true);
  });

  test("does not expose referral visibility from project update permission", async () => {
    const permissions = await makeService({
      "project.update": true,
      "project_referral.read": false,
      "project_referral.manage": false,
    }).buildPermissionsFromKnownData({
      authContext: authContext([
        "project.update",
      ]) as never,
      project,
      storedMembers: [] as never,
      rawMembers: [],
    });

    expect(permissions.can_update_project).toBe(true);
    expect(permissions.can_view_project_referral).toBe(false);
    expect(permissions.can_manage_project_referral).toBe(false);
  });
});

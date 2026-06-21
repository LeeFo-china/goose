import { describe, expect, test } from "bun:test";
import type { ProjectPrimaryAssignee } from "@/services/project-members";
import { buildAssigneeIndex, serializeAssignee } from "./base";

function assignee(input: {
  projectId?: string;
  employeeId: string;
  name: string;
  roleCode: "designer" | "supervisor" | "construction_manager";
}): ProjectPrimaryAssignee {
  return {
    project_id: input.projectId ?? "project-1",
    employee_id: input.employeeId,
    role_code: input.roleCode,
    employee: {
      id: input.employeeId,
      name: input.name,
      avatar: null,
      phone: null,
    },
  } as ProjectPrimaryAssignee;
}

describe("project primary assignee index", () => {
  test("uses construction manager as engineering assignee fallback", () => {
    const index = buildAssigneeIndex([
      assignee({
        employeeId: "employee-designer",
        name: "阿紫",
        roleCode: "designer",
      }),
      assignee({
        employeeId: "employee-construction",
        name: "欧阳克",
        roleCode: "construction_manager",
      }),
    ]);

    const projectAssignees = index.get("project-1");

    expect(serializeAssignee(projectAssignees?.designer)).toEqual({
      id: "employee-designer",
      name: "阿紫",
      avatar: null,
      phone: null,
    });
    expect(serializeAssignee(projectAssignees?.supervisor)).toEqual({
      id: "employee-construction",
      name: "欧阳克",
      avatar: null,
      phone: null,
    });
  });

  test("keeps supervisor before construction manager when both exist", () => {
    const index = buildAssigneeIndex([
      assignee({
        employeeId: "employee-construction",
        name: "欧阳克",
        roleCode: "construction_manager",
      }),
      assignee({
        employeeId: "employee-supervisor",
        name: "萧峰",
        roleCode: "supervisor",
      }),
    ]);

    expect(serializeAssignee(index.get("project-1")?.supervisor)).toEqual({
      id: "employee-supervisor",
      name: "萧峰",
      avatar: null,
      phone: null,
    });
  });
});

type ProjectTeamMember = {
  role_code: string;
  employee: {
    id: string;
    name: string | null;
    avatar: string | null;
  } | null;
};

type ProjectTeamEmployee = {
  id: string;
  name: string | null;
  avatar: string | null;
} | null;

export function deriveCustomerProjectTeam(input: {
  designer: ProjectTeamEmployee;
  members: ProjectTeamMember[];
}) {
  const serializeTeamEmployee = (roleCode: string) => {
    const employee = input.members.find((item) =>
      item.role_code === roleCode && item.employee
    )?.employee;
    return employee
      ? { id: employee.id, name: employee.name, avatar: employee.avatar }
      : null;
  };

  return {
    designer: input.designer ?? serializeTeamEmployee("designer"),
    supervisor: serializeTeamEmployee("supervisor"),
  };
}

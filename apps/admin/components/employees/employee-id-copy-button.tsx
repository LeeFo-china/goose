import { IdentityIdCopyButton } from "@/components/admin/identity-id-copy-button";

export function EmployeeIdCopyButton({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string | null | undefined;
}) {
  return (
    <IdentityIdCopyButton
      id={employeeId}
      name={employeeName}
      fallbackName="未命名员工"
      idLabel="员工ID"
      className="group-hover/employee-cell:opacity-100 group-focus-within/employee-cell:opacity-100"
    />
  );
}

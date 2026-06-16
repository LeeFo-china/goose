export function getEmployeeIdentityMeta({
  id,
  name,
}: {
  id: string;
  name: string | null | undefined;
}) {
  const trimmedName = name?.trim();

  return {
    id,
    name: trimmedName || "未命名员工",
  };
}

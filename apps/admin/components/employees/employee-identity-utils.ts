import { getIdentityCopyMeta } from "../admin/identity-copy-utils";

export function getEmployeeIdentityMeta({
  id,
  name,
}: {
  id: string;
  name: string | null | undefined;
}) {
  return getIdentityCopyMeta({
    id,
    name,
    fallbackName: "未命名员工",
  });
}

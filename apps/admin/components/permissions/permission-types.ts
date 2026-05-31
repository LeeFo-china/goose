import type { SelectOption } from "@/components/admin/form-select";
import type { PermissionCode, PermissionStatus } from "@gooes/domain";

export type PermissionRecord = {
  id: string;
  code: string;
  name: string | null;
  module: string;
  resource: string;
  action: string;
  description: string | null;
  status: PermissionStatus | string;
};

export type { PermissionCode, PermissionStatus, SelectOption };

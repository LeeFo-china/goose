"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";

import type {
  PlatformOperator,
  PlatformRoleOption,
} from "./platform-operator-types";

export function readPlatformOperatorVersion(
  operator: PlatformOperator | null | undefined,
) {
  return operator?.version && operator.version > 0 ? operator.version : 1;
}

export function togglePlatformOperatorRoleId(
  list: string[],
  id: string,
  checked: boolean,
) {
  if (checked) return Array.from(new Set([...list, id]));
  return list.filter((item) => item !== id);
}

export function PlatformOperatorRoleCheckboxField({
  roles,
  selectedRoleIds,
  disabled,
  onToggle,
}: {
  roles: PlatformRoleOption[];
  selectedRoleIds: string[];
  disabled: boolean;
  onToggle: (roleId: string, checked: boolean) => void;
}) {
  return (
    <Field className="md:col-span-2">
      <FieldLabel>平台角色</FieldLabel>
      <div className="grid max-h-48 gap-2 overflow-y-auto rounded-md border bg-muted/20 p-3 md:grid-cols-2">
        {roles.length ? roles.map((role) => (
          <label
            key={role.id}
            className="flex items-start gap-2 rounded-md bg-card p-2 text-sm"
          >
            <Checkbox
              checked={selectedRoleIds.includes(role.id)}
              disabled={disabled}
              onCheckedChange={(checked) => onToggle(role.id, checked === true)}
            />
            <span className="min-w-0">
              <span className="block truncate font-medium">{role.name || role.code}</span>
              <span className="block truncate text-xs text-muted-foreground">{role.code}</span>
            </span>
          </label>
        )) : (
          <div className="text-sm text-muted-foreground">暂无可分配的平台角色</div>
        )}
      </div>
    </Field>
  );
}

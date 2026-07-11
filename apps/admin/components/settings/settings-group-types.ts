import type { SystemSetting } from "@/components/settings/settings-types";

export type SettingsGroup = {
  code: string;
  label: string;
  settings: SystemSetting[];
  emptyCount: number;
  secretCount: number;
};

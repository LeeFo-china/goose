"use client";

import { PanelLeftClose, PanelLeftOpen, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdminPreferences, ContentWidth, ThemeTone } from "@/components/layout/admin-shell-preferences-store";

export {
  applyThemeTone,
  defaultPreferences,
  loadPreferences,
  savePreferences,
  type AdminPreferences,
  type ContentWidth,
  type ThemeTone,
} from "@/components/layout/admin-shell-preferences-store";

export function AdminPreferencesMenu({
  preferences,
  onChange,
}: {
  preferences: AdminPreferences;
  onChange: (preferences: AdminPreferences) => void;
}) {
  const update = (patch: Partial<AdminPreferences>) => {
    onChange({ ...preferences, ...patch });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label="界面偏好">
          <Settings2 data-icon="inline-start" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>界面偏好</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            update({ sidebarCollapsed: !preferences.sidebarCollapsed });
          }}
        >
          {preferences.sidebarCollapsed ? (
            <PanelLeftOpen data-icon="inline-start" />
          ) : (
            <PanelLeftClose data-icon="inline-start" />
          )}
          {preferences.sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            update({ compact: !preferences.compact });
          }}
        >
          {preferences.compact ? "关闭紧凑模式" : "开启紧凑模式"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>内容宽度</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preferences.contentWidth}
          onValueChange={(value) => update({ contentWidth: value as ContentWidth })}
        >
          <DropdownMenuRadioItem value="compact">紧凑</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="wide">标准</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="full">铺满</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>主题色</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preferences.themeTone}
          onValueChange={(value) => update({ themeTone: value as ThemeTone })}
        >
          <DropdownMenuRadioItem value="goose">品牌黄</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="neutral">中性黑</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="blue">运营蓝</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="green">工程绿</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="cyan">湖蓝</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="indigo">靛蓝</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="rose">玫红</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="amber">琥珀</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

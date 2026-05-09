"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  SettingEditor,
  SocialVideoTranscriptionTester,
} from "@/components/settings/settings-actions";
import type { SystemSetting } from "@/components/settings/settings-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SettingsGroup = {
  code: string;
  label: string;
  settings: SystemSetting[];
  emptyCount: number;
  secretCount: number;
};

type SettingsTabsProps = {
  groups: SettingsGroup[];
};

function normalizeGroup(groups: SettingsGroup[], value: string | null) {
  if (value && groups.some((group) => group.code === value)) {
    return value;
  }

  return groups[0]?.code || "";
}

export function SettingsTabs({ groups }: SettingsTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const activeGroupCode = normalizeGroup(groups, searchParams.get("group"));
  const activeGroup = groups.find((group) => group.code === activeGroupCode) || groups[0];

  const tabItems = useMemo(() => groups, [groups]);

  function switchGroup(groupCode: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("group", groupCode);
    startTransition(() => {
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    });
  }

  if (!activeGroup) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          暂无配置项
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto rounded-md border bg-card p-2">
        {tabItems.map((group) => {
          const active = group.code === activeGroup.code;
          return (
            <Button
              key={group.code}
              type="button"
              variant={active ? "default" : "ghost"}
              className={cn(
                "h-9 shrink-0 gap-2 px-3",
                active ? "shadow-sm" : "text-muted-foreground",
              )}
              onClick={() => switchGroup(group.code)}
              disabled={pending}
              aria-pressed={active}
            >
              {pending && active ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              <span>{group.label}</span>
              <Badge variant={active ? "secondary" : "outline"}>{group.settings.length}</Badge>
              {group.emptyCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs">
                  <AlertCircle className="size-3" />
                  {group.emptyCount}
                </span>
              ) : null}
            </Button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>{activeGroup.label}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeGroup.settings.length} 项配置，{activeGroup.secretCount} 项敏感配置，{activeGroup.emptyCount} 项未配置。
            </p>
          </div>
          <Badge variant={activeGroup.emptyCount > 0 ? "warning" : "success"}>
            {activeGroup.emptyCount > 0 ? `未配置 ${activeGroup.emptyCount}` : "配置完整"}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {activeGroup.code === "social_video" ? (
            <SocialVideoTranscriptionTester />
          ) : null}
          {activeGroup.settings.map((setting) => (
            <SettingEditor key={setting.key} setting={setting} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  SettingEditor,
  SocialVideoTranscriptionTester,
  TencentLbsConfigTester,
} from "@/components/settings/settings-actions";
import { PlatformPaymentSettingsPanel } from "@/components/settings/platform-payment-settings-panel";
import type { PlatformWechatPayProfileListResult } from "@/components/settings/platform-payment-settings-types";
import type { SettingsGroup } from "@/components/settings/settings-group-types";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type SettingsTabsProps = {
  groups: SettingsGroup[];
  isPlatformMode?: boolean;
  paymentProfiles?: PlatformWechatPayProfileListResult;
};

function normalizeGroup(groups: SettingsGroup[], value: string | null) {
  if (value && groups.some((group) => group.code === value)) {
    return value;
  }

  return groups[0]?.code || "";
}

function groupStatusVariant(group: SettingsGroup) {
  return group.emptyCount > 0 ? "warning" : "success";
}

function groupStatusLabel(group: SettingsGroup) {
  return group.emptyCount > 0 ? `未配置 ${group.emptyCount}` : "配置完整";
}

const emptyPaymentProfiles: PlatformWechatPayProfileListResult = {
  can_manage: false,
  profiles: [],
  error: null,
};

export function SettingsTabs({
  groups,
  isPlatformMode = false,
  paymentProfiles = emptyPaymentProfiles,
}: SettingsTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const activeGroupCode = normalizeGroup(groups, searchParams.get("group"));
  const activeGroup = groups.find((group) => group.code === activeGroupCode) || groups[0];
  const totalSettingsCount = groups.reduce((sum, group) => sum + group.settings.length, 0);

  function switchGroup(groupCode: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("group", groupCode);
    startTransition(() => {
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    });
  }

  if (!activeGroup) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardContent className="p-5 text-sm text-muted-foreground">
          暂无配置项
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs
      orientation="vertical"
      value={activeGroup.code}
      onValueChange={switchGroup}
      className="flex min-h-0 flex-1 flex-col"
    >
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="shrink-0 border-b bg-muted/35 p-3 lg:flex lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-center justify-between gap-3 lg:flex-col lg:items-start">
              <div className="min-w-0">
                <div className="text-sm font-medium">配置分组</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  <span className="tabular-nums">{groups.length}</span> 类，
                  <span className="tabular-nums">{totalSettingsCount}</span> 项
                </div>
              </div>
              <Badge variant={groupStatusVariant(activeGroup)} className="shrink-0">
                {groupStatusLabel(activeGroup)}
              </Badge>
            </div>

            <TabsList
              aria-label="系统配置分组"
              className="grid h-auto w-full grid-cols-2 items-stretch gap-2 rounded-none border-0 bg-transparent p-0 text-muted-foreground sm:grid-cols-3 lg:min-h-0 lg:flex-1 lg:grid-cols-1 lg:overflow-y-auto"
            >
              {groups.map((group) => {
                const active = group.code === activeGroup.code;

                return (
                  <TabsTrigger
                    key={group.code}
                    value={group.code}
                    disabled={pending}
                    className="h-auto min-h-10 min-w-0 justify-start gap-2 whitespace-normal rounded-md border bg-card px-3 py-2 text-left data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground lg:w-full"
                  >
                    {pending && active ? (
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{group.label}</span>
                    <span
                      className={cn(
                        badgeVariants({ variant: active ? "secondary" : "outline" }),
                        "shrink-0 px-1.5 py-0 text-[11px] tabular-nums",
                      )}
                    >
                      {group.settings.length}
                    </span>
                    {group.emptyCount > 0 ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-warning-foreground">
                        <AlertCircle />
                        <span className="tabular-nums">{group.emptyCount}</span>
                      </span>
                    ) : null}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="shrink-0 gap-3 border-b bg-card px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <CardTitle className="text-base">{activeGroup.label}</CardTitle>
                  <CardDescription className="mt-1">
                    {activeGroup.settings.length} 项配置，{activeGroup.secretCount} 项敏感配置，
                    {activeGroup.emptyCount} 项未配置。
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={groupStatusVariant(activeGroup)}>
                    {groupStatusLabel(activeGroup)}
                  </Badge>
                  {activeGroup.secretCount > 0 ? (
                    <Badge variant="warning">
                      敏感项 <span className="tabular-nums">{activeGroup.secretCount}</span>
                    </Badge>
                  ) : null}
                </div>
              </div>
            </CardHeader>

            <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
              <TabsContent
                value={activeGroup.code}
                className="m-0 h-full min-h-0 overflow-auto data-[state=inactive]:hidden"
              >
                {isPlatformMode && activeGroup.code === "payment" ? (
                  <PlatformPaymentSettingsPanel paymentProfiles={paymentProfiles} />
                ) : (
                  <div>
                    {activeGroup.code === "social_video" ? (
                      <SocialVideoTranscriptionTester />
                    ) : null}
                    {activeGroup.code === "tencent_lbs" ? (
                      <TencentLbsConfigTester />
                    ) : null}
                    {activeGroup.settings.map((setting) => (
                      <SettingEditor key={setting.key} setting={setting} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </CardContent>
          </div>
        </div>
      </Card>
    </Tabs>
  );
}

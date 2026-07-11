"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  CircleAlert,
  Headphones,
  Loader2,
  MessageSquareText,
  Settings2,
} from "lucide-react";
import type { SettingsGroup } from "@/components/settings/settings-group-types";
import { SettingEditor } from "@/components/settings/settings-actions";
import { TenantSmsSettingsPanel } from "@/components/settings/tenant-sms-settings-panel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tenantGroupMeta = {
  sms: {
    label: "短信配置",
    description: "选择平台统一通道或租户自有通道。",
    icon: MessageSquareText,
  },
  customer_service: {
    label: "客服配置",
    description: "维护客户可见的客服入口与联系方式。",
    icon: Headphones,
  },
} as const;

const fallbackGroupMeta = {
  description: "管理本租户可维护的业务配置。",
  icon: Settings2,
};

function normalizeGroup(groups: SettingsGroup[], value: string | null) {
  if (value && groups.some((group) => group.code === value)) {
    return value;
  }

  return groups[0]?.code || "";
}

function getTenantGroupMeta(code: string) {
  return tenantGroupMeta[code as keyof typeof tenantGroupMeta] || fallbackGroupMeta;
}

function useTabsOrientation() {
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
    "horizontal",
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateOrientation = () => {
      setOrientation(mediaQuery.matches ? "vertical" : "horizontal");
    };

    updateOrientation();
    mediaQuery.addEventListener("change", updateOrientation);
    return () => mediaQuery.removeEventListener("change", updateOrientation);
  }, []);

  return orientation;
}

function GroupStatus({ group }: { group: SettingsGroup }) {
  if (group.emptyCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warning-foreground">
        <CircleAlert aria-hidden="true" className="size-3.5" />
        待完善 <span className="tabular-nums">{group.emptyCount}</span> 项
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CheckCircle2 aria-hidden="true" className="size-3.5" />
      已完成
    </span>
  );
}

function TenantSettingsEmpty() {
  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
      <CardHeader className="border-b">
        <CardTitle>租户系统配置</CardTitle>
        <CardDescription>管理本租户可维护的业务能力。</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 p-0">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Settings2 aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>暂无可维护配置</EmptyTitle>
            <EmptyDescription>
              当前租户暂无可维护的系统配置。如需开通能力，请联系平台管理员。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  );
}

export function TenantSettingsWorkspace({ groups }: { groups: SettingsGroup[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const orientation = useTabsOrientation();
  const [pending, startTransition] = useTransition();
  const activeGroupCode = normalizeGroup(groups, searchParams.get("group"));
  const activeGroup =
    groups.find((group) => group.code === activeGroupCode) || groups[0];

  function switchGroup(groupCode: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("group", groupCode);
    startTransition(() => {
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    });
  }

  if (!activeGroup) {
    return <TenantSettingsEmpty />;
  }

  const activeMeta = getTenantGroupMeta(activeGroup.code);

  return (
    <Tabs
      orientation={orientation}
      value={activeGroup.code}
      onValueChange={switchGroup}
      className="flex min-h-0 flex-1 flex-col"
    >
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="shrink-0 border-b bg-muted/25 lg:min-h-0 lg:border-b-0 lg:border-r">
            <TabsList
              aria-label="租户系统配置分组"
              className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-0 bg-transparent p-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:items-stretch lg:justify-start lg:overflow-x-hidden lg:overflow-y-auto"
            >
              {groups.map((group) => {
                const groupMeta = getTenantGroupMeta(group.code);
                const GroupIcon = groupMeta.icon;
                const isActive = group.code === activeGroup.code;

                return (
                  <TabsTrigger
                    key={group.code}
                    value={group.code}
                    disabled={pending}
                    className="h-auto min-w-44 justify-start gap-3 border-transparent bg-transparent px-3 py-2.5 text-left shadow-none data-[state=active]:border-transparent data-[state=active]:bg-background data-[state=active]:shadow-none lg:w-full lg:min-w-0"
                  >
                    {pending && isActive ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <GroupIcon aria-hidden="true" className="size-4" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {group.label}
                      </span>
                      <span className="mt-0.5 block">
                        <GroupStatus group={group} />
                      </span>
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="shrink-0 border-b px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <CardTitle>{activeGroup.label}</CardTitle>
                  <CardDescription className="mt-1">
                    {activeMeta.description}
                  </CardDescription>
                </div>
                <Badge
                  variant={activeGroup.emptyCount > 0 ? "warning" : "success"}
                  className="w-fit shrink-0 gap-1.5"
                >
                  {activeGroup.emptyCount > 0 ? (
                    <CircleAlert aria-hidden="true" className="size-3.5" />
                  ) : (
                    <CheckCircle2 aria-hidden="true" className="size-3.5" />
                  )}
                  {activeGroup.emptyCount > 0
                    ? `${activeGroup.emptyCount} 项待完善`
                    : "配置完整"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
              {groups.map((group) => (
                <TabsContent
                  key={group.code}
                  value={group.code}
                  className="m-0 data-[state=inactive]:hidden"
                >
                  {group.code === "sms" ? (
                    <TenantSmsSettingsPanel settings={group.settings} />
                  ) : group.settings.length > 0 ? (
                    group.settings.map((setting) => (
                      <SettingEditor key={setting.key} setting={setting} />
                    ))
                  ) : (
                    <Empty className="min-h-56 rounded-none border-0">
                      <EmptyHeader>
                        <EmptyTitle>暂无配置项</EmptyTitle>
                        <EmptyDescription>
                          该分组当前没有需要维护的配置。
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </TabsContent>
              ))}
            </CardContent>
          </div>
        </div>
      </Card>
    </Tabs>
  );
}

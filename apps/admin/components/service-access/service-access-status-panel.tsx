"use client";

import type { AdminServiceAccessAction } from "@gooes/domain";
import {
  ClipboardPenLine,
  Clock3,
  Eye,
  LayoutDashboard,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  ShoppingCart,
  TriangleAlert,
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import type {
  ServiceAccessDisplay,
  ServiceAccessDisplayTone,
} from "./service-access-display";

type ContactActionKey = "contact_tenant_admin" | "contact_platform";
type InteractiveActionKey = Exclude<
  AdminServiceAccessAction["key"],
  ContactActionKey
>;

export type ServiceAccessActionHandlers = Partial<
  Record<InteractiveActionKey, () => void>
>;

const badgeVariantByTone = {
  neutral: "outline",
  success: "success",
  warning: "warning",
  danger: "danger",
} as const satisfies Record<ServiceAccessDisplayTone, BadgeProps["variant"]>;

const panelClassNameByTone = {
  neutral: "border-border",
  success: "border-success/35",
  warning: "border-warning/60",
  danger: "border-destructive/45",
} as const satisfies Record<ServiceAccessDisplayTone, string>;

const headerClassNameByTone = {
  neutral: "bg-muted/20",
  success: "bg-success/5",
  warning: "bg-warning/5",
  danger: "bg-destructive/5",
} as const satisfies Record<ServiceAccessDisplayTone, string>;

const alertClassNameByTone = {
  neutral: "bg-muted/20",
  success: "border-success/30 bg-success/5",
  warning: "border-warning/50 bg-warning/5 [&>svg]:text-warning-foreground",
  danger: "bg-destructive/5",
} as const satisfies Record<ServiceAccessDisplayTone, string>;

const statusIconByTone = {
  neutral: ShieldAlert,
  success: ShieldCheck,
  warning: TriangleAlert,
  danger: ShieldX,
} as const;

const actionIconByKey = {
  enter_workspace: LayoutDashboard,
  enter_readonly_workspace: LayoutDashboard,
  view_trial: Eye,
  apply_trial: ClipboardPenLine,
  purchase_service: ShoppingCart,
  refresh: RefreshCw,
} as const satisfies Record<InteractiveActionKey, typeof RefreshCw>;

const contactCopyByKey = {
  contact_tenant_admin: "请联系企业管理员处理。",
  contact_platform: "请联系平台客服处理",
} as const satisfies Record<ContactActionKey, string>;

export function ServiceAccessStatusPanel({
  display,
  actionHandlers,
  refreshing,
}: {
  display: ServiceAccessDisplay;
  actionHandlers: ServiceAccessActionHandlers;
  refreshing: boolean;
}) {
  const StatusIcon = statusIconByTone[display.tone];
  const contactActions = display.actions.filter(
    (action): action is typeof action & { key: ContactActionKey } => (
      action.key === "contact_tenant_admin" || action.key === "contact_platform"
    ),
  );
  const interactiveActions = display.actions.filter(
    (action): action is typeof action & { key: InteractiveActionKey } => (
      action.key !== "contact_tenant_admin" && action.key !== "contact_platform"
    ),
  ).filter((action) => actionHandlers[action.key] !== undefined);
  const hasFooter = contactActions.length > 0 || interactiveActions.length > 0;

  return (
    <Card className={cn(
      "w-full overflow-hidden shadow-none",
      panelClassNameByTone[display.tone],
    )}>
      <CardHeader className={cn(
        "border-b p-5 md:p-6",
        headerClassNameByTone[display.tone],
      )}>
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
            <StatusIcon className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                id="service-access-status-title"
                className="text-base font-semibold leading-none tracking-normal"
              >
                {display.title}
              </h1>
              <Badge variant={badgeVariantByTone[display.tone]}>
                {display.statusLabel}
              </Badge>
            </div>
            <CardDescription className="mt-1">
              当前企业的平台技术服务状态
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 p-5 md:p-6">
        <Alert
          variant={display.tone === "danger" ? "destructive" : "default"}
          className={alertClassNameByTone[display.tone]}
        >
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>状态说明</AlertTitle>
          <AlertDescription>{display.message}</AlertDescription>
        </Alert>

        {display.timeRows.length > 0 ? (
          <dl className="divide-y rounded-md border">
            {display.timeRows.map((row) => (
              <div
                key={row.key}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock3 className="size-4" aria-hidden="true" />
                  {row.label}
                </dt>
                <dd className="text-sm font-medium tabular-nums">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </CardContent>

      {hasFooter ? (
        <CardFooter className="flex flex-col items-stretch gap-3 border-t bg-muted/10 p-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div className="flex min-w-0 flex-col gap-1 text-sm text-muted-foreground">
            {contactActions.map((action) => (
              <p key={action.key}>{contactCopyByKey[action.key]}</p>
            ))}
          </div>
          {interactiveActions.length > 0 ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {interactiveActions.map((action) => {
                const ActionIcon = actionIconByKey[action.key];
                const isRefreshing = action.key === "refresh" && refreshing;
                const handler = actionHandlers[action.key];

                return (
                  <Button
                    key={action.key}
                    type="button"
                    variant={action.priority === "primary" ? "default" : "outline"}
                    disabled={isRefreshing}
                    aria-busy={isRefreshing}
                    onClick={handler}
                  >
                    {isRefreshing ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <ActionIcon data-icon="inline-start" aria-hidden="true" />
                    )}
                    {isRefreshing ? "正在刷新" : action.label}
                  </Button>
                );
              })}
            </div>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

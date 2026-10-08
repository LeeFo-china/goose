"use client";

import { useReducer, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestPlatformTenantJson } from "./platform-tenant-requests";
import {
  canConfirmPhoneChange, createPhoneChangeState, phoneChangeReducer,
  type PhoneChangeResult, type TenantAdmin,
} from "./platform-tenant-admin-phone-state";

export function PlatformTenantAdminPhoneDialog({ tenantId, tenantName, admin, onClose, onRefresh, onChanged }: {
  tenantId: string;
  tenantName: string;
  admin: TenantAdmin;
  onClose: () => void;
  onRefresh: () => Promise<TenantAdmin | null>;
  onChanged: (result: PhoneChangeResult) => void;
}) {
  const [currentAdmin, setCurrentAdmin] = useState(admin);
  const [state, dispatch] = useReducer(phoneChangeReducer, admin.version, createPhoneChangeState);
  const requestInFlight = useRef(false);
  const path = `/platform/tenants/${tenantId}/admins/${admin.id}/phone-change`;
  const pending = state.pending !== null;
  const canChange = currentAdmin.can_change;

  function failed(error: unknown) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
      ? error.status : undefined;
    dispatch({ type: "failed", status, message: error instanceof Error ? error.message : "请求失败，请重试" });
  }

  async function confirm() {
    if (requestInFlight.current || !canChange || !canConfirmPhoneChange(state)) return;
    requestInFlight.current = true;
    const event = { type: "confirm" as const, key: crypto.randomUUID() };
    const next = phoneChangeReducer(state, event);
    dispatch(event);
    try {
      const result = await requestPlatformTenantJson<PhoneChangeResult>(`${path}/confirm`, {
        method: "POST", body: JSON.stringify(next.confirmRequest), fallbackMessage: "登录手机号变更失败",
      });
      onChanged(result);
    } catch (error) {
      failed(error);
    } finally {
      requestInFlight.current = false;
    }
  }

  async function refresh() {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    dispatch({ type: "refresh" });
    try {
      const latest = await onRefresh();
      if (!latest) {
        dispatch({ type: "failed", status: 409, message: "当前页已找不到该管理员，请关闭弹窗并重新选择。" });
        return;
      }
      setCurrentAdmin(latest);
      dispatch({ type: "refreshed", version: latest.version });
    } catch (error) {
      failed(error);
    } finally {
      requestInFlight.current = false;
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !requestInFlight.current) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto [&>button]:hidden"
        onEscapeKeyDown={(event) => { if (requestInFlight.current) event.preventDefault(); }}
        onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>变更登录手机号</DialogTitle>
          <DialogDescription>
            仅用于同一管理员本人换号。由平台超管直接变更，无需短信验证码。
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">租户</dt><dd className="break-words">{tenantName}</dd>
          <dt className="text-muted-foreground">管理员</dt><dd>{currentAdmin.name || "未填写姓名"}</dd>
          <dt className="text-muted-foreground">原手机号</dt><dd>{currentAdmin.phone_masked || "未设置"}</dd>
          <dt className="text-muted-foreground">登录绑定</dt><dd>{currentAdmin.has_login_binding ? "已绑定登录账号" : "未绑定登录账号"}</dd>
        </dl>
        <p className="text-sm text-muted-foreground">
          员工档案、角色、业务记录和本人微信绑定保留。变更后该员工的后台会话失效，需使用新号码重新登录后台。
        </p>
        {!canChange ? <Alert variant="destructive"><AlertDescription>{currentAdmin.disabled_reason || "当前管理员不可变更手机号"}</AlertDescription></Alert> : null}
        {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
        {state.needsRefresh ? <Alert>
          <AlertTitle>请刷新后重新确认</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>管理员资料已变化。请刷新最新资料，核对新号码并重新确认本人身份。</p>
            <Button type="button" variant="outline" disabled={pending} onClick={() => void refresh()}>刷新管理员资料</Button>
          </AlertDescription>
        </Alert> : null}
        {state.outcomeUnknown ? <Alert>
          <AlertTitle>变更结果尚未确认</AlertTitle>
          <AlertDescription>可重试原请求确认结果。修改输入会开始新请求；建议先完成本次重试。</AlertDescription>
        </Alert> : null}
        <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
          <FieldGroup>
            <Field data-disabled={pending || !canChange}>
              <FieldLabel htmlFor="admin-new-phone">新手机号</FieldLabel>
              <Input id="admin-new-phone" type="tel" autoComplete="off" inputMode="tel" maxLength={11}
                value={state.newPhone} disabled={pending || !canChange}
                aria-describedby="admin-new-phone-help"
                onChange={(event) => dispatch({ type: "edit", field: "newPhone", value: event.target.value })} />
              <FieldDescription id="admin-new-phone-help">请核对管理员本人的新号码，确认后将作为后台登录手机号。</FieldDescription>
            </Field>
            <Field data-disabled={pending || !canChange}>
              <FieldLabel htmlFor="admin-phone-reason">变更原因</FieldLabel>
              <Textarea id="admin-phone-reason" required maxLength={500} rows={3} value={state.reason}
                disabled={pending || !canChange} aria-describedby="admin-phone-reason-help"
                onChange={(event) => dispatch({ type: "edit", field: "reason", value: event.target.value })} />
              <FieldDescription id="admin-phone-reason-help">必填，将记录到操作审计。{state.reason.length}/500 字</FieldDescription>
            </Field>
            <Field orientation="horizontal" data-disabled={pending || !canChange}>
              <Checkbox id="admin-same-person" checked={state.samePerson} disabled={pending || !canChange}
                onCheckedChange={(checked) => dispatch({ type: "same-person", value: checked === true })} />
              <FieldLabel htmlFor="admin-same-person">已核实管理员本人未变更</FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>取消</Button>
            <Button type="submit" disabled={!canChange || !canConfirmPhoneChange(state)}>
              {state.pending === "confirm" ? "正在变更…" : state.outcomeUnknown ? "重试原请求" : "确认变更"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

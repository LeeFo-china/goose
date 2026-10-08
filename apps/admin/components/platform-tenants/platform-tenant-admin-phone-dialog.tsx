"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestPlatformTenantJson } from "./platform-tenant-requests";
import {
  canConfirmPhoneChange, canSendPhoneCode, createPhoneChangeState, phoneChangeReducer,
  type PhoneChallenge, type PhoneChangeResult, type TenantAdmin,
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
  const [now, setNow] = useState(Date.now);
  const requestInFlight = useRef(false);
  const path = `/platform/tenants/${tenantId}/admins/${admin.id}/phone-change`;
  const pending = state.pending !== null;
  const cooldown = Math.max(0, Math.ceil((state.cooldownUntil - now) / 1000));
  const expired = Boolean(state.challenge && Date.parse(state.challenge.expires_at) <= now);
  const canChange = currentAdmin.can_change;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function failed(error: unknown) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
      ? error.status : undefined;
    const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code : undefined;
    dispatch({ type: "failed", status, code, message: error instanceof Error ? error.message : "请求失败，请重试" });
  }

  async function sendCode() {
    if (requestInFlight.current || !canChange || !canSendPhoneCode(state, Date.now())) return;
    requestInFlight.current = true;
    const event = { type: "send" as const, key: crypto.randomUUID(), now: Date.now() };
    const next = phoneChangeReducer(state, event);
    dispatch(event);
    try {
      const challenge = await requestPlatformTenantJson<PhoneChallenge>(`${path}/send-code`, {
        method: "POST", body: JSON.stringify(next.sendRequest), fallbackMessage: "验证码发送失败",
      });
      const receivedAt = Date.now();
      setNow(receivedAt);
      dispatch({ type: "sent", challenge, now: receivedAt });
    } catch (error) {
      failed(error);
    } finally {
      requestInFlight.current = false;
    }
  }

  async function confirm() {
    if (requestInFlight.current || !canChange || !canConfirmPhoneChange(state, Date.now())) return;
    requestInFlight.current = true;
    const event = { type: "confirm" as const, key: crypto.randomUUID(), now: Date.now() };
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
            仅用于同一管理员本人换号。验证新号码即可，无需旧号码验证码。
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
          <AlertTitle>请刷新后重新验证</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>管理员资料或验证状态已变化。刷新最新资料后，重新发送验证码并确认本人身份。</p>
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
              <div className="flex flex-wrap gap-2">
                <Input id="admin-new-phone" type="tel" autoComplete="off" inputMode="tel" maxLength={11}
                  className="min-w-0 flex-1" value={state.newPhone} disabled={pending || !canChange}
                  aria-describedby="admin-new-phone-help"
                  onChange={(event) => dispatch({ type: "edit", field: "newPhone", value: event.target.value })} />
                <Button type="button" variant="outline" disabled={!canChange || !canSendPhoneCode(state, now)} onClick={() => void sendCode()}>
                  {state.pending === "send" ? "正在发送…" : cooldown > 0 ? `${cooldown} 秒后重发` : "发送验证码"}
                </Button>
              </div>
              <FieldDescription id="admin-new-phone-help">短信将发送至新号码，请先核对号码。修改号码后需重新验证。</FieldDescription>
            </Field>
            <Field data-disabled={pending || !canChange || !state.challenge}>
              <FieldLabel htmlFor="admin-phone-code">新号码验证码</FieldLabel>
              <Input id="admin-phone-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={state.code} disabled={pending || !canChange || !state.challenge}
                onChange={(event) => dispatch({ type: "edit", field: "code", value: event.target.value })} />
              <FieldDescription aria-live="polite">
                {expired ? "验证码已过期，请重新发送。" : state.challenge ? `验证码已发送，有效至 ${new Date(state.challenge.expires_at).toLocaleTimeString("zh-CN")}。` : "先发送验证码，再填写新号码收到的 6 位验证码。"}
              </FieldDescription>
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
            <Button type="submit" disabled={!canChange || !canConfirmPhoneChange(state, now)}>
              {state.pending === "confirm" ? "正在变更…" : state.outcomeUnknown ? "重试原请求" : "确认变更"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

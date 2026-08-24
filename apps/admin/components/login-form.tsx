"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { navigateAfterAdminLogin } from "@/components/login-form-navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const verificationCodePlaceholder =
  process.env.NODE_ENV === "production" ? "请输入短信验证码" : "开发环境可留空";

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const value = (payload as { message?: unknown }).message;
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return fallback;
}

export function LoginForm({ sessionNotice }: { sessionNotice?: string | null }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  async function sendCode() {
    setError("");
    setMessage("");
    const normalizedPhone = phone.trim();
    if (!/^1\d{10}$/.test(normalizedPhone)) {
      setError("请输入 11 位手机号");
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(getPayloadMessage(payload, "验证码发送失败"));
      }
      setMessage("验证码已发送");
      setCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证码发送失败");
    } finally {
      setSending(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoggingIn(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(getPayloadMessage(payload, "登录失败"));
      }
      navigateAfterAdminLogin(router);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={login}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold leading-tight text-foreground">
          欢迎登录
        </h2>
        <p className="text-sm text-muted-foreground">
          使用员工手机号登录好店智装云
        </p>
      </div>
      {sessionNotice ? (
        <StatusAlert tone="warning">{sessionNotice}</StatusAlert>
      ) : null}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="phone">手机号</FieldLabel>
          <Input
            className="h-11 border-input bg-background text-base focus-visible:ring-ring sm:text-sm"
            id="phone"
            inputMode="tel"
            maxLength={11}
            placeholder="请输入手机号"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="code">验证码</FieldLabel>
          <div className="grid grid-cols-[minmax(0,1fr)_8.75rem] gap-3 max-[420px]:grid-cols-1">
            <Input
              className="h-11 border-input bg-background text-base focus-visible:ring-ring sm:text-sm"
              id="code"
              inputMode="numeric"
              maxLength={6}
              placeholder={verificationCodePlaceholder}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 border-primary/70 bg-card font-semibold text-primary hover:bg-secondary hover:text-primary disabled:border-border disabled:text-muted-foreground"
              disabled={sending || countdown > 0}
              onClick={sendCode}
            >
              {sending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : countdown > 0 ? (
                `${countdown}s`
              ) : (
                "获取验证码"
              )}
            </Button>
          </div>
        </Field>
      </FieldGroup>
      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}
      {message ? (
        <StatusAlert tone="success">{message}</StatusAlert>
      ) : null}
      <Button
        className="h-11 w-full rounded-md bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
        type="submit"
        disabled={loggingIn}
      >
        {loggingIn ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        登录
      </Button>
    </form>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const value = (payload as { message?: unknown }).message;
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return fallback;
}

export function LoginForm() {
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
    setSending(true);
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
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
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <Card className="w-full max-w-[420px] border-slate-200 shadow-[0_18px_60px_rgba(15,23,42,0.12)]">
      <CardHeader className="gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="size-5" />
        </div>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-xl">员工后台登录</CardTitle>
          <CardDescription>
            使用已绑定员工档案的手机号进入管理后台。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={login}>
          <FieldGroup>
          <Field>
            <FieldLabel htmlFor="phone">手机号</FieldLabel>
            <Input
              id="phone"
              inputMode="tel"
              maxLength={11}
              placeholder="请输入员工手机号"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="code">验证码</FieldLabel>
            <div className="grid grid-cols-[1fr_112px] gap-2">
              <Input
                id="code"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 位验证码"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
              <Button
                type="button"
                variant="outline"
                disabled={sending || countdown > 0 || phone.length !== 11}
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
          <Button className="w-full" type="submit" disabled={loggingIn}>
            {loggingIn ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            登录后台
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

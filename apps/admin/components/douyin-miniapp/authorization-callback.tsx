"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requestBackendJson } from "@/lib/backend-client";

type AuthorizationCallbackPayload = {
  intent: string;
  authorization_code: string;
  expires_in: number;
};

type AuthorizationCallbackParseResult =
  | { ok: true; payload: AuthorizationCallbackPayload }
  | { ok: false; message: string };

const INVALID_CALLBACK_MESSAGE =
  "授权回调参数无效，请返回工作台重新发起授权。";

export function parseAuthorizationCallbackSearch(
  search: string,
): AuthorizationCallbackParseResult {
  const params = new URLSearchParams(search);
  const intent = params.get("intent");
  const authorizationCode = params.get("authorization_code");
  const expiresIn = Number(params.get("expires_in"));

  if (
    !intent
    || intent.length < 32
    || intent.length > 200
    || !authorizationCode
    || authorizationCode.length < 8
    || authorizationCode.length > 4096
    || !Number.isInteger(expiresIn)
    || expiresIn < 1
    || expiresIn > 7200
  ) {
    return { ok: false, message: INVALID_CALLBACK_MESSAGE };
  }

  return {
    ok: true,
    payload: {
      intent,
      authorization_code: authorizationCode,
      expires_in: expiresIn,
    },
  };
}

export async function exchangeAuthorizationCallback(input: {
  search: string;
  replaceHistory(): void;
  request(payload: AuthorizationCallbackPayload): Promise<unknown>;
  redirect(): void;
}) {
  const parsed = parseAuthorizationCallbackSearch(input.search);
  input.replaceHistory();
  if (!parsed.ok) throw new Error(parsed.message);

  await input.request(parsed.payload);
  input.redirect();
}

export function TenantDouyinAuthorizationCallback() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void exchangeAuthorizationCallback({
      search: window.location.search,
      replaceHistory: () => {
        window.history.replaceState(
          {},
          "",
          "/douyin-miniapp/authorize/callback",
        );
      },
      request: (payload) =>
        requestBackendJson(
          "/tenant/douyin-miniapp/authorization-callback",
          {
            method: "POST",
            body: JSON.stringify(payload),
            fallbackMessage: "抖音小程序授权绑定失败",
          },
        ),
      redirect: () => {
        router.replace("/douyin-miniapp/workspace");
        router.refresh();
      },
    }).catch((callbackError) => {
      setError(callbackError instanceof Error
        ? callbackError.message
        : "抖音小程序授权绑定失败");
    });
  }, [router]);

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>{error ? "授权未完成" : "正在完成授权"}</CardTitle>
        <CardDescription>
          {error
            ? "授权信息未能绑定到当前租户，可返回工作台重新发起。"
            : "正在校验抖音授权结果并绑定当前租户，请不要关闭页面。"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex flex-col gap-4">
            <Alert variant="destructive">
              <ShieldAlert aria-hidden="true" />
              <AlertTitle>授权绑定失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button asChild className="self-start" variant="outline">
              <Link href="/douyin-miniapp/workspace">返回工作台</Link>
            </Button>
          </div>
        ) : (
          <div
            className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Loader2 className="animate-spin" aria-hidden="true" />
            正在安全交换授权凭证
          </div>
        )}
      </CardContent>
    </Card>
  );
}

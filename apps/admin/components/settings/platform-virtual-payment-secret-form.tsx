"use client";

import { type FormEvent, useState } from "react";
import { KeyRound, Save } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { toSafeVirtualPaymentMutationMessage } from "@/components/settings/platform-virtual-payment-errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type {
  PlatformVirtualPaymentMessageAuth,
  PlatformVirtualPaymentProductSummary,
} from "@/components/settings/platform-virtual-payment-settings-types";
import type { BrandingVirtualPaymentEnvironment } from "@gooes/domain";

type PlatformVirtualPaymentSecretFormProps = {
  environment: BrandingVirtualPaymentEnvironment;
  summary: PlatformVirtualPaymentProductSummary;
  messageAuth: PlatformVirtualPaymentMessageAuth;
  readonly: boolean;
  onSaveSecret: (input: { appKey: string; revision: number }) => Promise<void>;
  onSaveMessageToken: (messageToken: string) => Promise<void>;
};

export function PlatformVirtualPaymentSecretForm({
  environment,
  summary,
  messageAuth,
  readonly,
  onSaveSecret,
  onSaveMessageToken,
}: PlatformVirtualPaymentSecretFormProps) {
  return (
    <>
      <EnvironmentSecretCard
        environment={environment}
        summary={summary}
        readonly={readonly}
        onSave={onSaveSecret}
      />
      <MessageTokenCard
        messageAuth={messageAuth}
        readonly={readonly}
        onSave={onSaveMessageToken}
      />
    </>
  );
}

function EnvironmentSecretCard({
  environment,
  summary,
  readonly,
  onSave,
}: Pick<
  PlatformVirtualPaymentSecretFormProps,
  "environment" | "summary" | "readonly"
> & {
  onSave: PlatformVirtualPaymentSecretFormProps["onSaveSecret"];
}) {
  const [revision, setRevision] = useState(
    String((summary.secret.revision ?? 0) + 1),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readonly || pending) return;
    setError("");
    setSaved(false);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const appKey = String(formData.get("app_key") ?? "").trim();
    const nextRevision = Number(revision);
    if (!appKey) {
      setError("请输入当前环境的 AppKey");
      return;
    }
    if (!Number.isSafeInteger(nextRevision) || nextRevision < 1) {
      setError("密钥版本必须是大于 0 的整数");
      return;
    }

    setPending(true);
    try {
      await onSave({ appKey, revision: nextRevision });
      form.reset();
      setRevision(String(nextRevision + 1));
      setSaved(true);
    } catch (caught) {
      setError(toSafeVirtualPaymentMutationMessage(caught, "AppKey 保存失败"));
    } finally {
      setPending(false);
    }
  }

  const environmentLabel = environment === "production" ? "生产" : "沙箱";
  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle>{environmentLabel} AppKey</CardTitle>
          <CardDescription>
            新密钥会加密保存，页面不会读取或回填明文。
          </CardDescription>
        </div>
        <Badge variant={summary.secret.configured ? "success" : "warning"}>
          {summary.secret.configured
            ? `已配置 v${summary.secret.revision}`
            : "未配置"}
        </Badge>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent>
          <FieldGroup>
            {error ? <StatusAlert>{error}</StatusAlert> : null}
            {saved ? (
              <StatusAlert tone="success">AppKey 已安全保存。</StatusAlert>
            ) : null}
            <Field data-disabled={readonly || pending}>
              <FieldLabel htmlFor={`${environment}-app-key`}>AppKey</FieldLabel>
              <Input
                id={`${environment}-app-key`}
                name="app_key"
                type="password"
                autoComplete="new-password"
                placeholder="输入新的 AppKey"
                disabled={readonly || pending}
                required
              />
              <FieldDescription>
                留空不会覆盖当前密钥。请从微信虚拟支付后台复制完整值。
              </FieldDescription>
            </Field>
            <Field data-disabled={readonly || pending}>
              <FieldLabel htmlFor={`${environment}-secret-revision`}>
                密钥版本
              </FieldLabel>
              <Input
                id={`${environment}-secret-revision`}
                name="revision"
                type="number"
                min={1}
                step={1}
                value={revision}
                onChange={(event) => setRevision(event.target.value)}
                disabled={readonly || pending}
                required
              />
              <FieldDescription>
                每次轮换使用递增版本，避免覆盖并发更新。
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end border-t pt-5">
          <Button type="submit" disabled={readonly || pending}>
            {pending
              ? <Spinner data-icon="inline-start" />
              : <KeyRound data-icon="inline-start" />}
            {pending ? "保存中" : "保存 AppKey"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function MessageTokenCard({
  messageAuth,
  readonly,
  onSave,
}: Pick<PlatformVirtualPaymentSecretFormProps, "messageAuth" | "readonly"> & {
  onSave: PlatformVirtualPaymentSecretFormProps["onSaveMessageToken"];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readonly || pending) return;
    setError("");
    setSaved(false);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const nextToken = String(formData.get("message_token") ?? "").trim();
    if (!nextToken) {
      setError("请输入微信支付消息令牌");
      return;
    }

    setPending(true);
    try {
      await onSave(nextToken);
      form.reset();
      setSaved(true);
    } catch (caught) {
      setError(toSafeVirtualPaymentMutationMessage(
        caught,
        "消息令牌保存失败",
      ));
    } finally {
      setPending(false);
    }
  }

  const token = messageAuth.message_token;
  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle>支付消息令牌</CardTitle>
          <CardDescription>
            用于校验微信虚拟支付消息签名，沙箱与生产共用。
          </CardDescription>
        </div>
        <Badge variant={token.valid ? "success" : "warning"}>
          {token.valid ? "已就绪" : token.configured ? "需更新" : "未配置"}
        </Badge>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent>
          <FieldGroup>
            {error ? <StatusAlert>{error}</StatusAlert> : null}
            {saved ? (
              <StatusAlert tone="success">消息令牌已安全保存。</StatusAlert>
            ) : null}
            <Field data-disabled={readonly || pending}>
              <FieldLabel htmlFor="virtual-payment-message-token">
                消息令牌
              </FieldLabel>
              <Input
                id="virtual-payment-message-token"
                name="message_token"
                type="password"
                autoComplete="new-password"
                placeholder="输入新的消息令牌"
                disabled={readonly || pending}
                required
              />
              <FieldDescription>
                当前来源：{sourceLabel(token.source)}。明文保存后不可查看。
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end border-t pt-5">
          <Button type="submit" disabled={readonly || pending}>
            {pending
              ? <Spinner data-icon="inline-start" />
              : <Save data-icon="inline-start" />}
            {pending ? "保存中" : "保存消息令牌"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function sourceLabel(source: PlatformVirtualPaymentMessageAuth["message_token"]["source"]) {
  if (source === "database") return "数据库配置";
  if (source === "env") return "环境变量";
  if (source === "default") return "默认配置";
  return "未配置";
}

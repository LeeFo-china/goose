"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, Save } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { SystemSetting } from "@/components/settings/settings-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function updateSetting(key: string, value: string | null) {
  const response = await fetch(`/api/backend/admin/system-settings/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(getPayloadMessage(data, "系统配置保存失败"));
  }
}

function sourceBadge(setting: SystemSetting) {
  if (setting.source === "database") {
    return <Badge variant="success">数据库</Badge>;
  }
  if (setting.source === "env") {
    return <Badge variant="warning">环境变量</Badge>;
  }
  if (setting.source === "default") {
    return <Badge variant="outline">默认值</Badge>;
  }
  return <Badge variant="danger">未配置</Badge>;
}

function formatValue(value: string | null) {
  return value && value.trim() ? value : "-";
}

export function SettingEditor({ setting }: { setting: SystemSetting }) {
  const router = useRouter();
  const [value, setValue] = useState(setting.is_secret ? "" : setting.stored_value || "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const initialValue = setting.is_secret ? "" : setting.stored_value || "";
  const dirty = setting.is_secret && setting.source === "database"
    ? true
    : value !== initialValue;

  function submit() {
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        await updateSetting(setting.key, value.trim() ? value : null);
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "系统配置保存失败");
      }
    });
  }

  function reset() {
    setValue(initialValue);
    setError("");
    setSaved(false);
  }

  return (
    <div className="grid gap-4 border-t px-5 py-4 lg:grid-cols-[minmax(220px,0.9fr)_minmax(260px,1fr)_auto] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium">{setting.name}</div>
          {sourceBadge(setting)}
          {setting.is_secret ? <Badge variant="warning">敏感</Badge> : null}
          <Badge variant="outline">{setting.value_type}</Badge>
        </div>
        <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{setting.key}</div>
        {setting.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{setting.description}</p>
        ) : null}
        <div className="mt-2 text-xs text-muted-foreground">
          当前生效值：<span className="break-all font-mono">{formatValue(setting.effective_value)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`setting-${setting.key}`}>数据库配置值</Label>
        {setting.is_secret ? (
          <Input
            id={`setting-${setting.key}`}
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={setting.source === "database" ? "输入新密钥，留空保存可清空数据库值" : "输入新密钥，留空则继承环境变量"}
            autoComplete="new-password"
          />
        ) : setting.value_type === "boolean" ? (
          <Select value={value || "__empty__"} onValueChange={(nextValue) => setValue(nextValue === "__empty__" ? "" : nextValue)}>
            <SelectTrigger id={`setting-${setting.key}`}>
              <SelectValue placeholder="继承环境变量或默认值" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__empty__">继承环境变量或默认值</SelectItem>
              <SelectItem value="true">true</SelectItem>
              <SelectItem value="false">false</SelectItem>
            </SelectContent>
          </Select>
        ) : setting.value_type === "json" || setting.key.includes("PROMPT") ? (
          <Textarea
            id={`setting-${setting.key}`}
            rows={setting.key.includes("PROMPT") ? 5 : 3}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="留空则继承环境变量或默认值"
          />
        ) : (
          <Input
            id={`setting-${setting.key}`}
            type={setting.value_type === "number" ? "number" : "text"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="留空则继承环境变量或默认值"
          />
        )}
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {saved ? <StatusAlert tone="success">已保存</StatusAlert> : null}
      </div>

      <div className="flex gap-2 lg:justify-end">
        <Button type="button" variant="outline" onClick={reset} disabled={pending || !dirty}>
          <RotateCcw data-icon="inline-start" />
          重置
        </Button>
        <Button type="button" onClick={submit} disabled={pending || !dirty}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : saved ? <Check data-icon="inline-start" /> : <Save data-icon="inline-start" />}
          保存
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, Save } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { SystemSetting } from "@/components/settings/settings-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sourceBadge, updateSetting } from "@/components/settings/settings-mutation-shared";

type FileAccessMode = "public" | "signed";

type FileAccessRule = {
  access_mode: FileAccessMode;
  signed_url_ttl_seconds: number;
};

type FileAccessPolicy = {
  default: FileAccessRule;
  scenes: Record<string, FileAccessRule>;
};

const fileAccessSceneLabels: Record<string, string> = {
  default: "默认策略",
  project_log: "项目日志",
  project_log_comment: "日志评论",
  project_acceptance: "工序验收",
  customer_follow_up_comment: "客户跟进评论",
  customer_douyin_screenshot: "抖音截图",
  expense_request: "费用凭证",
  expense_request_settlement: "打款凭证",
  referral_payment: "介绍费凭证",
  employee_avatar: "员工头像",
  customer_avatar: "客户头像",
  h5_marketing_page: "H5 活动页",
  panorama_tiles: "360 全景瓦片",
};

const defaultFileAccessPolicy: FileAccessPolicy = {
  default: {
    access_mode: "signed",
    signed_url_ttl_seconds: 1800,
  },
  scenes: {
    project_log: { access_mode: "signed", signed_url_ttl_seconds: 1800 },
    project_log_comment: { access_mode: "signed", signed_url_ttl_seconds: 1800 },
    project_acceptance: { access_mode: "signed", signed_url_ttl_seconds: 1800 },
    customer_follow_up_comment: { access_mode: "signed", signed_url_ttl_seconds: 1800 },
    customer_douyin_screenshot: { access_mode: "signed", signed_url_ttl_seconds: 1800 },
    expense_request: { access_mode: "signed", signed_url_ttl_seconds: 600 },
    expense_request_settlement: { access_mode: "signed", signed_url_ttl_seconds: 600 },
    referral_payment: { access_mode: "signed", signed_url_ttl_seconds: 600 },
    employee_avatar: { access_mode: "signed", signed_url_ttl_seconds: 21600 },
    customer_avatar: { access_mode: "signed", signed_url_ttl_seconds: 21600 },
    h5_marketing_page: { access_mode: "public", signed_url_ttl_seconds: 0 },
    panorama_tiles: { access_mode: "public", signed_url_ttl_seconds: 0 },
  },
};

function valueTypeLabel(valueType: SystemSetting["value_type"]) {
  if (valueType === "number") return "数字";
  if (valueType === "boolean") return "开关";
  if (valueType === "json") return "结构化数据";
  return "文本";
}

function parseFileAccessPolicy(value: string | null | undefined): FileAccessPolicy {
  if (!value?.trim()) return defaultFileAccessPolicy;

  try {
    const parsed = JSON.parse(value) as Partial<FileAccessPolicy>;
    return {
      default: normalizeFileAccessRule(parsed.default, defaultFileAccessPolicy.default),
      scenes: Object.fromEntries(
        Object.keys(defaultFileAccessPolicy.scenes).map((scene) => [
          scene,
          normalizeFileAccessRule(
            parsed.scenes?.[scene],
            defaultFileAccessPolicy.scenes[scene],
          ),
        ]),
      ),
    };
  } catch {
    return defaultFileAccessPolicy;
  }
}

function normalizeFileAccessRule(
  value: Partial<FileAccessRule> | undefined,
  fallback: FileAccessRule,
): FileAccessRule {
  const accessMode = value?.access_mode === "public" || value?.access_mode === "signed"
    ? value.access_mode
    : fallback.access_mode;
  const ttl = Number(value?.signed_url_ttl_seconds);
  return {
    access_mode: accessMode,
    signed_url_ttl_seconds: Number.isFinite(ttl) && ttl >= 0
      ? Math.floor(ttl)
      : fallback.signed_url_ttl_seconds,
  };
}

function serializeFileAccessPolicy(policy: FileAccessPolicy) {
  return JSON.stringify(policy, null, 2);
}

export function FileAccessPolicyEditor({ setting }: { setting: SystemSetting }) {
  const router = useRouter();
  const [policy, setPolicy] = useState(() =>
    parseFileAccessPolicy(setting.stored_value || setting.effective_value)
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const initialValue = serializeFileAccessPolicy(
    parseFileAccessPolicy(setting.stored_value || setting.effective_value),
  );
  const dirty = serializeFileAccessPolicy(policy) !== initialValue;

  function updateRule(scene: "default" | string, patch: Partial<FileAccessRule>) {
    setPolicy((current) => {
      if (scene === "default") {
        return {
          ...current,
          default: normalizeFileAccessRule({ ...current.default, ...patch }, current.default),
        };
      }

      return {
        ...current,
        scenes: {
          ...current.scenes,
          [scene]: normalizeFileAccessRule(
            { ...current.scenes[scene], ...patch },
            current.scenes[scene] || current.default,
          ),
        },
      };
    });
  }

  function submit() {
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        await updateSetting(setting.key, serializeFileAccessPolicy(policy));
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "系统配置保存失败");
      }
    });
  }

  function reset() {
    setPolicy(parseFileAccessPolicy(setting.stored_value || setting.effective_value));
    setError("");
    setSaved(false);
  }

  const rows = [
    ["default", policy.default],
    ...Object.entries(policy.scenes),
  ] as Array<[string, FileAccessRule]>;

  return (
    <div className="flex flex-col gap-4 border-t px-5 py-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium">{setting.name}</div>
          {sourceBadge(setting)}
          <Badge variant="outline">{valueTypeLabel(setting.value_type)}</Badge>
        </div>
        <div className="break-all font-mono text-xs text-muted-foreground">{setting.key}</div>
        <p className="text-sm text-muted-foreground">{setting.description}</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>场景</TableHead>
            <TableHead>访问模式</TableHead>
            <TableHead>签名有效期</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([scene, rule]) => (
            <TableRow key={scene}>
              <TableCell>
                <div className="font-medium">{fileAccessSceneLabels[scene] || scene}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{scene}</div>
              </TableCell>
              <TableCell>
                <Select
                  value={rule.access_mode}
                  onValueChange={(value) =>
                    updateRule(scene, { access_mode: value as FileAccessMode })
                  }
                >
                  <SelectTrigger aria-label={`${fileAccessSceneLabels[scene] || scene}访问模式`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="signed">签名链接</SelectItem>
                      <SelectItem value="public">公开链接</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={0}
                  value={rule.signed_url_ttl_seconds}
                  disabled={rule.access_mode === "public"}
                  onChange={(event) =>
                    updateRule(scene, {
                      signed_url_ttl_seconds: Number(event.target.value || 0),
                    })
                  }
                  aria-label={`${fileAccessSceneLabels[scene] || scene}签名有效期秒数`}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {saved ? <StatusAlert tone="success">已保存</StatusAlert> : null}

      <div className="flex gap-2 self-end">
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

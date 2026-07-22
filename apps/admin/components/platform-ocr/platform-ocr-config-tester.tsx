"use client";

import { useRef, useState } from "react";
import { FileImage, Loader2, TestTube2, TriangleAlert } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  buildBackendProxyPath,
  getPayloadMessage,
  type BackendClientPayload,
} from "@/lib/backend-client";

const MAX_TEST_FILE_SIZE = 2 * 1024 * 1024;
const TEST_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

type OcrConfigTestResult = {
  ok: true;
  provider_request_id: string | null;
  duration_ms: number;
  warning_codes: string[];
};

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(size >= 1024 * 100 ? 0 : 1)} KB`;
}

async function testPlatformOcrConfig(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  const response = await fetch(buildBackendProxyPath("/platform/ocr/config-test"), {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({})) as
    BackendClientPayload<OcrConfigTestResult>;
  if (!response.ok || payload.success === false || !payload.data) {
    throw new Error(getPayloadMessage(payload, "腾讯云 OCR 配置测试失败"));
  }
  return payload.data;
}

export function PlatformOcrConfigTester() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OcrConfigTestResult | null>(null);
  const [pending, setPending] = useState(false);

  function selectFile(file: File | null) {
    setResult(null);
    setError("");
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!TEST_MIME_TYPES.has(file.type)) {
      setSelectedFile(null);
      setError("测试图片仅支持 JPEG 或 PNG 格式");
      return;
    }
    if (file.size > MAX_TEST_FILE_SIZE) {
      setSelectedFile(null);
      setError("测试图片不能超过 2MB");
      return;
    }
    setSelectedFile(file);
  }

  async function submit() {
    if (!selectedFile || pending) return;
    setPending(true);
    setError("");
    setResult(null);
    try {
      setResult(await testPlatformOcrConfig(selectedFile));
    } catch (submitError) {
      setError(submitError instanceof Error
        ? submitError.message
        : "腾讯云 OCR 配置测试失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-b bg-muted/20 px-5 py-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.9fr)_minmax(260px,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium">腾讯云 OCR 连通性测试</div>
            <Badge variant="warning">可能计费</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            使用当前平台配置识别一张非生产营业执照样本，仅返回调用状态和诊断信息，不保存图片或识别字段。
          </p>
        </div>

        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="platform-ocr-test-file">测试图片</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={inputRef}
              id="platform-ocr-test-file"
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only !h-px !w-px"
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              <FileImage data-icon="inline-start" />
              选择图片
            </Button>
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {selectedFile
                ? `${selectedFile.name} · ${formatFileSize(selectedFile.size)}`
                : "未选择文件"}
            </span>
          </div>
          <FieldDescription>仅限已获授权的 JPEG/PNG 测试样本，文件不超过 2MB。</FieldDescription>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          {result ? (
            <StatusAlert tone="success">
              <div className="flex flex-col gap-1">
                <div>配置测试成功</div>
                <div className="break-all text-xs">
                  请求编号：{result.provider_request_id || "-"}
                </div>
                <div className="text-xs">耗时：{result.duration_ms} ms</div>
                <div className="break-all text-xs">
                  告警代码：{result.warning_codes.length
                    ? result.warning_codes.join("、")
                    : "无"}
                </div>
              </div>
            </StatusAlert>
          ) : null}
        </Field>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" disabled={!selectedFile || pending}>
              {pending
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <TestTube2 data-icon="inline-start" />}
              测试配置
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <TriangleAlert />确认调用腾讯云 OCR
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">请确认已获得该测试图片的使用授权，且图片不包含真实生产资料。</span>
                <span className="block font-medium text-foreground">本次调用可能产生腾讯云费用。</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={submit}>确认并测试</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

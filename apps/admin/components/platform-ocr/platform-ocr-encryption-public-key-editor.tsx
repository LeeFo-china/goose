"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FileKey,
  Loader2,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  createLatestPublicKeyFileReader,
  MAX_PUBLIC_KEY_FILE_SIZE,
  normalizeTencentOcrPublicKeyInput,
} from "@/components/platform-ocr/platform-ocr-public-key-input";
import {
  sourceBadge,
  updateSetting,
} from "@/components/settings/settings-mutation-shared";
import type { SystemSetting } from "@/components/settings/settings-types";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const PUBLIC_KEY_HEADER = "-----BEGIN RSA PUBLIC KEY-----";
const PUBLIC_KEY_FOOTER = "-----END RSA PUBLIC KEY-----";

export function TencentOcrEncryptionPublicKeyEditor({
  setting,
}: {
  setting: SystemSetting;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileReaderRef = useRef<ReturnType<
    typeof createLatestPublicKeyFileReader
  > | null>(null);
  const fileReader =
    fileReaderRef.current ?? createLatestPublicKeyFileReader();
  fileReaderRef.current = fileReader;
  const [value, setValue] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [fileReading, setFileReading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function resetFeedback() {
    setError("");
    setSuccessMessage("");
  }

  function resetNativeFileInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function clearLocalMaterial() {
    fileReader.invalidate();
    setFileReading(false);
    setValue("");
    setSelectedFileName("");
    resetNativeFileInput();
  }

  async function selectFile(file: File | null) {
    resetFeedback();
    resetNativeFileInput();
    fileReader.invalidate();
    setFileReading(false);
    if (!file) {
      setSelectedFileName("");
      return;
    }
    if (!/\.(pem|txt)$/i.test(file.name)) {
      setError("仅支持 .pem 或 .txt 公钥文件");
      setSelectedFileName("");
      return;
    }
    if (file.size > MAX_PUBLIC_KEY_FILE_SIZE) {
      setError("公钥文件不能超过 64KB");
      setSelectedFileName("");
      return;
    }

    setSelectedFileName(file.name);
    setFileReading(true);
    const result = await fileReader.read(file);
    if (result.status === "stale") return;
    setFileReading(false);
    if (result.status === "error") {
      setSelectedFileName("");
      setError(result.error);
      return;
    }

    const normalized = normalizeTencentOcrPublicKeyInput(result.content);
    setValue(result.content);
    if (!normalized.ok) setError(normalized.error);
  }

  function submit() {
    resetFeedback();
    fileReader.invalidate();
    setFileReading(false);
    const normalized = normalizeTencentOcrPublicKeyInput(value);
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }

    startTransition(async () => {
      try {
        await updateSetting(setting.key, normalized.pem);
        clearLocalMaterial();
        setSuccessMessage("已安全保存，公钥内容已从页面清除");
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "OCR 加密公钥保存失败",
        );
      }
    });
  }

  function clearSetting() {
    resetFeedback();
    fileReader.invalidate();
    setFileReading(false);
    startTransition(async () => {
      try {
        await updateSetting(setting.key, null);
        clearLocalMaterial();
        setSuccessMessage("数据库公钥配置已清除");
        router.refresh();
      } catch (clearError) {
        setError(
          clearError instanceof Error
            ? clearError.message
            : "OCR 加密公钥清除失败",
        );
      }
    });
  }

  return (
    <div className="grid gap-4 border-b px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(220px,0.9fr)_minmax(260px,1fr)_auto] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium">{setting.name}</div>
          {sourceBadge(setting)}
          <Badge variant="warning">敏感</Badge>
          <Badge variant={setting.is_configured ? "success" : "outline"}>
            {setting.is_configured ? "已安全配置" : "未配置"}
          </Badge>
        </div>
        <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
          {setting.key}
        </div>
        {setting.description ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {setting.description}
          </p>
        ) : null}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck />
          <span>
            {setting.is_configured
              ? "公钥已加密保存，原文不会在页面回显。"
              : "尚未配置身份证 OCR 加密公钥。"}
          </span>
        </div>
      </div>

      <Field data-invalid={Boolean(error) || undefined}>
        <FieldLabel htmlFor={`setting-${setting.key}`}>新的加密公钥</FieldLabel>
        <Textarea
          id={`setting-${setting.key}`}
          rows={7}
          value={value}
          onChange={(event) => {
            fileReader.invalidate();
            setFileReading(false);
            setValue(event.target.value);
            setSelectedFileName("");
            resetFeedback();
          }}
          placeholder={`${PUBLIC_KEY_HEADER}\n...\n${PUBLIC_KEY_FOOTER}\n\n也可粘贴完整 PEM 的外层 Base64 编码`}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          aria-invalid={Boolean(error)}
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            ref={inputRef}
            type="file"
            accept=".pem,.txt,text/plain,application/x-pem-file"
            className="sr-only !h-px !w-px"
            aria-label="上传 OCR 加密公钥文件"
            disabled={pending || fileReading}
            onChange={(event) => {
              void selectFile(event.target.files?.[0] ?? null);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending || fileReading}
            onClick={() => inputRef.current?.click()}
          >
            {fileReading ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <FileKey data-icon="inline-start" />
            )}
            {fileReading ? "读取中" : "上传 PEM 文件"}
          </Button>
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {selectedFileName || "未选择文件"}
          </span>
        </div>
        <FieldDescription>
          支持 PKCS#1 PEM 或其外层 Base64 编码，文件不超过
          64KB。保存时后端会校验为腾讯 OCR 要求的 1024 位 RSA 公钥。
        </FieldDescription>
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {successMessage ? (
          <StatusAlert tone="success">
            <span className="inline-flex items-center gap-2">
              <Check />
              {successMessage}
            </span>
          </StatusAlert>
        ) : null}
      </Field>

      <div className="flex flex-wrap gap-2 lg:justify-end">
        {setting.source === "database" ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={pending || fileReading}
              >
                <Trash2 data-icon="inline-start" />
                清除配置
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>清除 OCR 加密公钥？</AlertDialogTitle>
                <AlertDialogDescription>
                  清除数据库配置后，系统会回退到环境变量；若环境变量也未配置，身份证加密识别将不可用。此操作不会删除历史
                  OCR 记录。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  className={buttonVariants({ variant: "destructive" })}
                  onClick={clearSetting}
                >
                  确认清除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <Button
          type="button"
          onClick={submit}
          disabled={pending || fileReading || !value.trim()}
        >
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <Save data-icon="inline-start" />
          )}
          保存公钥
        </Button>
      </div>
    </div>
  );
}

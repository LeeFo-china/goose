"use client";

import { useRef, useState, useTransition } from "react";
import { Image, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ImageRepairState, ImageUsage } from "@/components/marketing/h5-page-editor-types";
import { formatFileSize, getImageRequirement, getImageValidationIssues, loadImageFile, repairImageFile, uploadEditorImage } from "@/components/marketing/h5-page-editor-api";
import { previewImage } from "@/components/marketing/h5-page-editor-block-utils";

export function ImageUploadField({
  label,
  value,
  usage,
  onChange,
}: {
  label: string;
  value: string;
  usage: ImageUsage;
  onChange: (value: string) => void;
}) {
  const requirement = getImageRequirement(usage);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [repairState, setRepairState] = useState<ImageRepairState | null>(null);
  const [repairRatio, setRepairRatio] = useState(requirement.ratios[0]?.value || "free");
  const [quality, setQuality] = useState(0.82);
  const [uploading, setUploading] = useState(false);
  const cannotRepair = Boolean(repairState && repairState.width < requirement.minWidth);

  const closeRepair = () => {
    if (repairState?.objectUrl) {
      URL.revokeObjectURL(repairState.objectUrl);
    }
    setRepairState(null);
  };

  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const image = await loadImageFile(file);
      const issues = getImageValidationIssues(image, usage);
      if (issues.length > 0) {
        setRepairRatio(requirement.ratios[0]?.value || "free");
        setQuality(0.82);
        setRepairState({ ...image, issues, usage });
        return;
      }

      try {
        const url = await uploadEditorImage(file);
        onChange(url);
        toast.success("图片已上传");
        URL.revokeObjectURL(image.objectUrl);
      } catch (uploadError) {
        setRepairRatio(requirement.ratios[0]?.value || "free");
        setQuality(0.82);
        setRepairState({
          ...image,
          issues: [
            uploadError instanceof Error ? uploadError.message : "图片上传失败",
            "可尝试压缩并转为 WebP 后重新上传",
          ],
          usage,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  const applyRepair = async () => {
    if (!repairState || cannotRepair) return;
    setUploading(true);
    try {
      const ratioConfig = requirement.ratios.find((item) => item.value === repairRatio);
      const repairedFile = await repairImageFile({
        file: repairState.file,
        quality,
        ratio: ratioConfig?.ratio ?? null,
      });
      const repairedImage = await loadImageFile(repairedFile);
      const issues = getImageValidationIssues(repairedImage, usage, {
        skipRatio: usage === "content" && repairRatio === "free",
      });
      URL.revokeObjectURL(repairedImage.objectUrl);
      if (issues.length > 0) {
        throw new Error(issues[0]);
      }

      const url = await uploadEditorImage(repairedFile);
      onChange(url);
      toast.success("图片已修正并上传");
      closeRepair();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片修正失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input
          value={value}
          placeholder="https://..."
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <Upload data-icon="inline-start" />
          )}
          上传
        </Button>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          onChange={(event) => {
            void selectFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </div>
      <FieldDescription>
        {requirement.label} 建议宽度不低于 {requirement.minWidth}px，单张不超过 5MB，比例建议 {requirement.ratios.filter((item) => item.ratio).map((item) => item.label).join(" / ") || "自由"}。
      </FieldDescription>
      {value ? (
        <div className="overflow-hidden rounded-md border bg-muted/40">
          <div className="relative">
            <img src={value} alt={label} className="max-h-32 w-full object-cover" />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute right-2 top-2 bg-background/90"
              onClick={() => onChange("")}
            >
              <Trash2 data-icon="inline-start" />
              删除
            </Button>
          </div>
          <div className="border-t bg-background px-3 py-2 text-xs text-muted-foreground">
            图片已写入当前模块配置，保存草稿或发布后生效。
          </div>
        </div>
      ) : null}

      <Dialog open={Boolean(repairState)} onOpenChange={(open) => {
        if (!open) closeRepair();
      }}>
        <DialogContent className="max-h-[90vh] max-w-[760px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>图片修正</DialogTitle>
            <DialogDescription>
              当前图片不符合 {requirement.label} 要求，可在线裁剪、压缩并转为 WebP。
            </DialogDescription>
          </DialogHeader>

          {repairState ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
              <div className="overflow-hidden rounded-lg border bg-black/5">
                <img
                  src={repairState.objectUrl}
                  alt="待修正图片"
                  className="max-h-[420px] w-full object-contain"
                />
              </div>
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border bg-[#fffdf6] p-3">
                  <div className="text-sm font-semibold">不符合原因</div>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {repairState.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                  <div className="mt-2 text-xs text-muted-foreground">
                    原图 {repairState.width} x {repairState.height}，{formatFileSize(repairState.file.size)}
                  </div>
                </div>

                <Field>
                  <FieldLabel>裁剪比例</FieldLabel>
                  <Select value={repairRatio} onValueChange={setRepairRatio}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {requirement.ratios.map((ratio) => (
                          <SelectItem key={ratio.value} value={ratio.value}>
                            {ratio.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel>输出质量：{Math.round(quality * 100)}%</FieldLabel>
                  <Input
                    type="range"
                    min={60}
                    max={92}
                    step={2}
                    value={Math.round(quality * 100)}
                    onChange={(event) => setQuality(Number(event.target.value) / 100)}
                  />
                  <FieldDescription>默认输出 WebP，通常可以压到 5MB 以内。</FieldDescription>
                </Field>

                {cannotRepair ? (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    图片宽度过低，在线工具不做强行放大。请重新选择更清晰的素材。
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeRepair}>
              重新选择
            </Button>
            <Button type="button" disabled={uploading || cannotRepair} onClick={applyRepair}>
              {uploading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              应用并上传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Field>
  );
}

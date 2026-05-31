"use client";

import { ChangeEvent, useId, useRef } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getPreviewImageSrc } from "@/components/projects/project-acceptance-utils";

export function ImageUploadBlock({
  label,
  images,
  disabled,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string;
  images: string[];
  disabled: boolean;
  uploading: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId}>{label}</Label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={onUpload}
          disabled={disabled || uploading}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
          上传
        </Button>
      </div>
      {images.length > 0 ? (
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(64px,64px))] gap-2">
          {images.map((image, index) => (
            <div
              key={`${image}-${index}`}
              className="group relative size-16 overflow-hidden rounded-md border bg-muted"
            >
              <img src={getPreviewImageSrc(image)} alt={label} className="size-full object-cover" />
              {!disabled ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute inset-x-1 bottom-1 h-6 px-2 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => onRemove(index)}
                >
                  删除
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
          暂无图片
        </div>
      )}
    </div>
  );
}

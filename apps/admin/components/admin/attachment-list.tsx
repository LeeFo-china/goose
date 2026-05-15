"use client";

import { RotatableImagePreview } from "@/components/admin/rotatable-image-preview";

export type ImageAttachment = {
  id: string;
  src: string;
  alt: string;
  label?: string;
  title?: string;
};

export function ImageAttachmentList({
  images,
  emptyText = "暂无附件",
}: {
  images: ImageAttachment[];
  emptyText?: string;
}) {
  if (images.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4">
      {images.map((image) => (
        <RotatableImagePreview
          key={image.id}
          src={image.src}
          alt={image.alt}
          label={image.label}
          title={image.title}
        />
      ))}
    </div>
  );
}

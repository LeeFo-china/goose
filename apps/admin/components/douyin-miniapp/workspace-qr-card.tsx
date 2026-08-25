"use client";

import Image from "next/image";
import { QrCode } from "lucide-react";

export function ReleaseQrCard({
  description,
  expired,
  imageAlt,
  title,
  url,
}: {
  readonly description: string;
  readonly expired: boolean;
  readonly imageAlt: string;
  readonly title: string;
  readonly url: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-4 sm:flex-row sm:items-center">
      {url ? (
        <Image
          alt={imageAlt}
          className="size-32 rounded-md border bg-card object-contain"
          height={128}
          src={url}
          unoptimized
          width={128}
        />
      ) : (
        <div className="flex size-32 items-center justify-center rounded-md border bg-muted text-muted-foreground">
          <QrCode aria-hidden="true" className="size-8" />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-semibold">
          {expired ? `${title}已过期` : title}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

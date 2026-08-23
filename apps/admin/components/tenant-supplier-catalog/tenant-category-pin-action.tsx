"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpToLine } from "lucide-react";
import { toast } from "sonner";

import {
  initializeCatalogCreateIntent,
  resolveCatalogCreateIntent,
} from "@/components/supplier-catalog/supplier-catalog-rules";
import type { CatalogCreateIntent } from "@/components/supplier-catalog/supplier-catalog-types";
import { Button } from "@/components/ui/button";
import { requestBackendJson } from "@/lib/backend-client";

import { buildTenantCategoryPinCommand } from "./tenant-catalog-requests";
import { newTenantCatalogCommandKey } from "./tenant-catalog-rules";

export function TenantCategoryPinAction({
  record,
}: {
  record: { id: string; version: number };
}) {
  const router = useRouter();
  const intentRef = useRef<CatalogCreateIntent | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    const intent = resolveCatalogCreateIntent(
      intentRef.current,
      { expected_version: record.version },
      () => newTenantCatalogCommandKey("category-pin"),
    );
    intentRef.current = intent;
    const request = buildTenantCategoryPinCommand({
      id: record.id,
      expectedVersion: record.version,
      idempotencyKey: intent.key,
    });
    setPending(true);
    try {
      await requestBackendJson(request.path, {
        ...request.init,
        fallbackMessage: "置顶私有类目失败",
      });
      toast.success("私有类目已置顶");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "置顶私有类目失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => void submit()}
    >
      <ArrowUpToLine data-icon="inline-start" />
      {pending ? "置顶中" : "置顶"}
    </Button>
  );
}

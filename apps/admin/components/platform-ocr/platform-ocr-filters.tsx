"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  platformOcrDocumentOptions,
  platformOcrStatusOptions,
} from "@/components/platform-ocr/platform-ocr-types";

const statusOptions = [
  { value: "__all", label: "全部状态" },
  ...platformOcrStatusOptions,
] as const;
const documentOptions = [
  { value: "__all", label: "全部证照" },
  ...platformOcrDocumentOptions,
] as const;

function buildHref(input: {
  pageSize: number;
  status: string;
  documentType: string;
  tenantId: string;
}) {
  const query = new URLSearchParams();
  query.set("pageSize", String(input.pageSize));
  if (input.status !== "__all") query.set("status", input.status);
  if (input.documentType !== "__all") {
    query.set("document_type", input.documentType);
  }
  if (input.tenantId.trim()) query.set("tenant_id", input.tenantId.trim());
  return `/platform/ocr?${query.toString()}`;
}

export function PlatformOcrFilters({
  pageSize,
  status,
  documentType,
  tenantId,
}: {
  pageSize: number;
  status: string;
  documentType: string;
  tenantId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedStatus, setSelectedStatus] = useState(status || "__all");
  const [selectedDocument, setSelectedDocument] = useState(
    documentType || "__all",
  );
  const [selectedTenant, setSelectedTenant] = useState(tenantId);

  useEffect(() => {
    setSelectedStatus(status || "__all");
    setSelectedDocument(documentType || "__all");
    setSelectedTenant(tenantId);
  }, [documentType, status, tenantId]);

  function navigate(nextTenant = selectedTenant) {
    startTransition(() => {
      router.push(buildHref({
        pageSize,
        status: selectedStatus,
        documentType: selectedDocument,
        tenantId: nextTenant,
      }));
      router.refresh();
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate();
  }

  return (
    <form
      className="grid gap-3 md:grid-cols-[180px_200px_minmax(260px,1fr)_72px]"
      onSubmit={submit}
    >
      <FormSelect
        id="platform-ocr-status-filter"
        value={selectedStatus}
        options={statusOptions}
        disabled={pending}
        onChange={setSelectedStatus}
      />
      <FormSelect
        id="platform-ocr-document-filter"
        value={selectedDocument}
        options={documentOptions}
        disabled={pending}
        onChange={setSelectedDocument}
      />
      <InputGroup>
        <InputGroupAddon><Search data-icon="inline-start" /></InputGroupAddon>
        <InputGroupInput
          value={selectedTenant}
          placeholder="租户 ID"
          disabled={pending}
          onChange={(event) => setSelectedTenant(event.target.value)}
        />
        {selectedTenant ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              disabled={pending}
              onClick={() => {
                setSelectedTenant("");
                navigate("");
              }}
            >
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        筛选
      </Button>
    </form>
  );
}

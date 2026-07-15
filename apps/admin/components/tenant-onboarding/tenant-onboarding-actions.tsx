"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, RefreshCw } from "lucide-react";

import { ServiceProviderPublicationDialog } from "@/components/tenant-onboarding/service-provider-publication-dialog";
import { TenantOnboardingDetailDialog } from "@/components/tenant-onboarding/tenant-onboarding-detail-dialog";
import type {
  ServiceProviderPublicationListRecord,
  TenantOnboardingApplicationListRecord,
} from "@/components/tenant-onboarding/tenant-onboarding-types";
import { Button } from "@/components/ui/button";
import { requestBackendJson } from "@/lib/backend-client";

export function TenantOnboardingApplicationActions({
  application,
}: {
  application: TenantOnboardingApplicationListRecord;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Eye data-icon="inline-start" />
        查看审核
      </Button>
      <TenantOnboardingDetailDialog
        application={application}
        open={open}
        paths={{
          start: applicationMutationPaths.startReview(application.id),
          assist: applicationMutationPaths.requestPartnerAssist(application.id),
          supplement: applicationMutationPaths.requestSupplement(application.id),
          approve: applicationMutationPaths.approve(application.id),
          reject: applicationMutationPaths.reject(application.id),
        }}
        requestMutation={requestOnboardingMutation}
        onOpenChange={setOpen}
        onCompleted={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}

export function ServiceProviderPublicationActions({
  publication,
}: {
  publication: ServiceProviderPublicationListRecord;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Eye data-icon="inline-start" />
        查看发布
      </Button>
      <ServiceProviderPublicationDialog
        publication={publication}
        open={open}
        paths={{
          publish: publicationMutationPaths.publish(publication.tenant_id),
          returnDraft: publicationMutationPaths.returnDraft(publication.tenant_id),
          suspend: publicationMutationPaths.suspend(publication.tenant_id),
        }}
        requestMutation={requestOnboardingMutation}
        onOpenChange={setOpen}
        onCompleted={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}

export const applicationMutationPaths = {
  startReview: (id: string) => applicationPath(id, "/start-review"),
  requestPartnerAssist: (id: string) => applicationPath(id, "/request-partner-assist"),
  requestSupplement: (id: string) => applicationPath(id, "/request-supplement"),
  approve: (id: string) => applicationPath(id, "/approve"),
  reject: (id: string) => applicationPath(id, "/reject"),
} as const;

export const publicationMutationPaths = {
  publish: (tenantId: string) => publicationPath(tenantId, "/publish"),
  returnDraft: (tenantId: string) => publicationPath(tenantId, "/return-draft"),
  suspend: (tenantId: string) => publicationPath(tenantId, "/suspend"),
} as const;

export function requestOnboardingMutation<Result>(
  path: string,
  body: Record<string, unknown>,
) {
  return requestBackendJson<Result>(path, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body),
    fallbackMessage: "操作失败，请稍后重试",
  });
}

export function ConflictRefreshAction({
  error,
}: {
  error: ActionRequestError | null;
}) {
  const router = useRouter();
  if (!error || !isStateConflict(error)) return null;
  return (
    <Button type="button" variant="outline" onClick={() => router.refresh()}>
      <RefreshCw data-icon="inline-start" />
      刷新后重试
    </Button>
  );
}

export type ActionRequestError = Error & {
  code?: string;
  status?: number;
};

export function toActionRequestError(error: unknown): ActionRequestError {
  return error instanceof Error
    ? error as ActionRequestError
    : new Error("操作失败，请稍后重试") as ActionRequestError;
}

function isStateConflict(error: ActionRequestError) {
  return error.status === 409 || [
    "TENANT_ONBOARDING_STATE_CONFLICT",
    "SERVICE_PROVIDER_STATE_CONFLICT",
  ].includes(error.code || "");
}

function applicationPath(id: string, suffix: string) {
  return `/platform/tenant-onboarding/applications/${id}${suffix}`;
}

function publicationPath(tenantId: string, suffix: string) {
  return `/platform/service-provider-publications/${tenantId}${suffix}`;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  platformTabsListClassName,
  platformTabsTriggerClassName,
} from "@/components/platform/platform-tabs";

import { PlatformSupplierActions } from "./platform-supplier-actions";
import {
  ContactsAndAddressesPanel,
  EventsPanel,
  QualificationsPanel,
  ServiceRegionsPanel,
} from "./platform-supplier-detail-panels";
import { PlatformSupplierFormButton } from "./platform-supplier-form";
import {
  canEditSupplier,
  isSupplierReadOnly,
} from "./platform-supplier-rules";
import {
  formatSupplierDate,
  onboardingMeta,
  operationalMeta,
  qualificationHealthMeta,
  supplierTypeLabel,
  type PlatformSupplierDetailRecord,
  type PlatformSupplierListItem,
} from "./platform-supplier-types";
import { usePlatformSupplierDetailData } from "./use-platform-supplier-detail-data";

type DetailTab =
  | "profile"
  | "qualifications"
  | "regions"
  | "contacts"
  | "events";

export function PlatformSupplierDetail({
  supplier,
  open,
  onOpenChange,
  canManage,
  canReview,
  canBlacklist,
}: {
  supplier: PlatformSupplierListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  canReview: boolean;
  canBlacklist: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DetailTab>("profile");
  const resource = usePlatformSupplierDetailData({
    supplierId: supplier.id,
    activeTab,
    open,
  });

  function refreshSupplier() {
    void resource.refreshActive();
    router.refresh();
  }

  const health = qualificationHealthMeta[supplier.qualification_health];
  const readOnly = resource.detail.data
    ? isSupplierReadOnly(resource.detail.data)
    : supplier.operational_status === "blacklisted";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(86vh,760px)] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{supplier.name}</DialogTitle>
            <Badge variant={health.variant}>{health.label}</Badge>
          </div>
          <DialogDescription>
            {supplier.code}，{supplierTypeLabel[supplier.supplier_type]}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as DetailTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 border-b px-5 pt-3">
            <TabsList className={platformTabsListClassName}>
              <TabsTrigger value="profile" className={platformTabsTriggerClassName}>
                基本资料
              </TabsTrigger>
              <TabsTrigger
                value="qualifications"
                className={platformTabsTriggerClassName}
              >
                资质
              </TabsTrigger>
              <TabsTrigger value="regions" className={platformTabsTriggerClassName}>
                服务区域
              </TabsTrigger>
              <TabsTrigger value="contacts" className={platformTabsTriggerClassName}>
                联系人与地址
              </TabsTrigger>
              <TabsTrigger value="events" className={platformTabsTriggerClassName}>
                操作记录
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <TabsContent value="profile" className="m-0">
              {resource.detail.loading ||
              (!resource.detail.data && !resource.detail.error) ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : resource.detail.error ? (
                <LoadError
                  message={resource.detail.error}
                  onRetry={() => void resource.loadDetail()}
                />
              ) : resource.detail.data ? (
                <ProfilePanel
                  detail={resource.detail.data}
                  canManage={canManage}
                  canReview={canReview}
                  canBlacklist={canBlacklist}
                  onChanged={refreshSupplier}
                />
              ) : null}
            </TabsContent>
            <TabsContent value="qualifications" className="m-0">
              {resource.qualifications.loading &&
              !resource.qualifications.data ? (
                <Skeleton className="h-48 w-full" />
              ) : resource.qualifications.error ? (
                <LoadError
                  message={resource.qualifications.error}
                  onRetry={() =>
                    void resource.loadQualifications(resource.qualificationPage)
                  }
                />
              ) : (
                <QualificationsPanel
                  supplierId={supplier.id}
                  data={resource.qualifications.data}
                  canReview={canReview && !readOnly}
                  onReload={refreshSupplier}
                  onPageChange={resource.setQualificationPage}
                  loading={resource.qualifications.loading}
                />
              )}
            </TabsContent>
            <TabsContent value="regions" className="m-0">
              {resource.regions.loading && !resource.regions.data ? (
                <Skeleton className="h-48 w-full" />
              ) : resource.regions.error ? (
                <LoadError
                  message={resource.regions.error}
                  onRetry={() => void resource.loadRegions(resource.regionPage)}
                />
              ) : (
                <ServiceRegionsPanel
                  data={resource.regions.data}
                  onPageChange={resource.setRegionPage}
                  loading={resource.regions.loading}
                />
              )}
            </TabsContent>
            <TabsContent value="contacts" className="m-0">
              {(resource.contacts.loading && !resource.contacts.data) ||
              (resource.addresses.loading && !resource.addresses.data) ? (
                <Skeleton className="h-48 w-full" />
              ) : resource.contacts.error || resource.addresses.error ? (
                <div className="space-y-3">
                  {resource.contacts.error ? (
                    <LoadError
                      message={resource.contacts.error}
                      onRetry={() =>
                        void resource.loadContacts(resource.contactPage)
                      }
                    />
                  ) : null}
                  {resource.addresses.error ? (
                    <LoadError
                      message={resource.addresses.error}
                      onRetry={() =>
                        void resource.loadAddresses(resource.addressPage)
                      }
                    />
                  ) : null}
                </div>
              ) : (
                <ContactsAndAddressesPanel
                  contacts={resource.contacts.data}
                  addresses={resource.addresses.data}
                  onContactPageChange={resource.setContactPage}
                  onAddressPageChange={resource.setAddressPage}
                  contactsLoading={resource.contacts.loading}
                  addressesLoading={resource.addresses.loading}
                />
              )}
            </TabsContent>
            <TabsContent value="events" className="m-0">
              {resource.events.loading && !resource.events.data ? (
                <Skeleton className="h-48 w-full" />
              ) : resource.events.error ? (
                <LoadError
                  message={resource.events.error}
                  onRetry={() => void resource.loadEvents(resource.eventPage)}
                />
              ) : (
                <EventsPanel
                  data={resource.events.data}
                  onPageChange={resource.setEventPage}
                  loading={resource.events.loading}
                />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>数据加载失败</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-3">
        <span>{message}</span>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          重新加载
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function ProfilePanel({
  detail,
  canManage,
  canReview,
  canBlacklist,
  onChanged,
}: {
  detail: PlatformSupplierDetailRecord;
  canManage: boolean;
  canReview: boolean;
  canBlacklist: boolean;
  onChanged: () => void;
}) {
  const canEdit = canEditSupplier(detail, canManage);
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        {[
          ["供应商编码", detail.code],
          ["供应商名称", detail.name],
          ["法定名称", detail.legal_name],
          ["统一社会信用代码", detail.unified_social_credit_code || "-"],
          ["供应商类型", supplierTypeLabel[detail.supplier_type]],
          ["当前版本", String(detail.version)],
          ["准入状态", onboardingMeta[detail.onboarding_status].label],
          ["运营状态", operationalMeta[detail.operational_status].label],
          ["更新时间", formatSupplierDate(detail.updated_at)],
          ["审核意见", detail.review_remark || "-"],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 border-b pb-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <PlatformSupplierFormButton supplier={detail} onSaved={onChanged} />
        ) : null}
        <PlatformSupplierActions
          supplier={detail}
          canManage={canManage}
          canReview={canReview}
          canBlacklist={canBlacklist}
          onChanged={onChanged}
        />
      </div>
    </div>
  );
}

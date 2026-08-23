"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  platformTabsListClassName,
  platformTabsTriggerClassName,
} from "@/components/platform/platform-tabs";
import { requestBackendJson } from "@/lib/backend-client";

import { isRelationshipReadOnly } from "./supplier-workspace-rules";
import {
  relationshipStatusMeta,
  supplierTypeLabel,
  type TenantSupplierRelationship,
} from "./supplier-types";
import { TenantSupplierActions } from "./tenant-supplier-actions";
import {
  ContractsPanel,
  EligibilityPanel,
  EventsPanel,
  ServiceRegionsPanel,
} from "./tenant-supplier-detail-panels";
import {
  type TenantSupplierDetailTab,
  useTenantSupplierDetail,
} from "./use-tenant-supplier-detail";

export function TenantSupplierDetail({
  relationship,
  open,
  onOpenChange,
  canManage,
  canManageContracts,
  contractRequired,
  onChanged,
}: {
  relationship: TenantSupplierRelationship;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  canManageContracts: boolean;
  contractRequired: boolean;
  onChanged: () => void;
}) {
  const [activeTab, setActiveTab] =
    useState<TenantSupplierDetailTab>("settings");
  const resource = useTenantSupplierDetail({
    relationshipId: relationship.id,
    activeTab,
    open,
  });
  const detail = resource.detail.data ?? relationship;
  const status = relationshipStatusMeta[detail.relationship_status];
  const isPrivateSupplier =
    detail.supplier.ownership_scope === "tenant" &&
    detail.supplier.owner_tenant_id === detail.tenant_id;

  useEffect(() => {
    if (
      isPrivateSupplier &&
      (activeTab === "eligibility" || activeTab === "regions")
    ) {
      setActiveTab("settings");
    }
  }, [activeTab, isPrivateSupplier]);

  function handleChanged() {
    void resource.loadDetail();
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,780px)] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{detail.supplier.name}</DialogTitle>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <DialogDescription>
            {detail.supplier.code}，{supplierTypeLabel[detail.supplier.supplier_type]}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TenantSupplierDetailTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 border-b px-5 pt-3">
            <TabsList className={platformTabsListClassName}>
              <TabsTrigger value="settings" className={platformTabsTriggerClassName}>
                基本信息
              </TabsTrigger>
              <TabsTrigger value="contracts" className={platformTabsTriggerClassName}>
                合同
              </TabsTrigger>
              {isPrivateSupplier ? null : (
                <TabsTrigger value="eligibility" className={platformTabsTriggerClassName}>
                  准入与资质
                </TabsTrigger>
              )}
              {isPrivateSupplier ? null : (
                <TabsTrigger value="regions" className={platformTabsTriggerClassName}>
                  服务区域
                </TabsTrigger>
              )}
              <TabsTrigger value="events" className={platformTabsTriggerClassName}>
                操作记录
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <TabsContent value="settings" className="m-0">
              {resource.detail.loading && !resource.detail.data ? (
                <Skeleton className="h-72 w-full" />
              ) : resource.detail.error ? (
                <LoadError message={resource.detail.error} onRetry={resource.loadDetail} />
              ) : (
                <SettingsPanel
                  relationship={detail}
                  canManage={canManage}
                  onChanged={handleChanged}
                  loadLatest={resource.loadDetail}
                />
              )}
            </TabsContent>
            <TabsContent value="contracts" className="m-0">
              {resource.contracts.loading && !resource.contracts.data ? (
                <Skeleton className="h-56 w-full" />
              ) : resource.contracts.error ? (
                <LoadError
                  message={resource.contracts.error}
                  onRetry={() => resource.loadContracts(resource.contractPage)}
                />
              ) : (
                <ContractsPanel
                  contracts={resource.contracts.data?.list ?? []}
                  page={resource.contractPage}
                  totalPages={resource.contracts.data?.pagination.totalPages ?? 0}
                  contractRequired={contractRequired}
                  canManageContracts={canManageContracts}
                  onPageChange={resource.setContractPage}
                />
              )}
            </TabsContent>
            {isPrivateSupplier ? null : (
              <TabsContent value="eligibility" className="m-0">
                {resource.eligibility.loading && !resource.eligibility.data ? (
                  <Skeleton className="h-48 w-full" />
                ) : resource.eligibility.error ? (
                  <LoadError
                    message={resource.eligibility.error}
                    onRetry={resource.loadEligibility}
                  />
                ) : (
                  <EligibilityPanel
                    relationship={detail}
                    eligibility={resource.eligibility.data ?? detail.eligibility}
                  />
                )}
              </TabsContent>
            )}
            {isPrivateSupplier ? null : (
              <TabsContent value="regions" className="m-0">
                <ServiceRegionsPanel relationship={detail} />
              </TabsContent>
            )}
            <TabsContent value="events" className="m-0">
              {resource.events.loading && !resource.events.data ? (
                <Skeleton className="h-56 w-full" />
              ) : resource.events.error ? (
                <LoadError
                  message={resource.events.error}
                  onRetry={() => resource.loadEvents(resource.eventPage)}
                />
              ) : (
                <EventsPanel
                  events={resource.events.data?.list ?? []}
                  page={resource.eventPage}
                  totalPages={resource.events.data?.pagination.totalPages ?? 0}
                  onPageChange={resource.setEventPage}
                />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SettingsPanel({
  relationship,
  canManage,
  onChanged,
  loadLatest,
}: {
  relationship: TenantSupplierRelationship;
  canManage: boolean;
  onChanged: () => void;
  loadLatest: () => Promise<TenantSupplierRelationship | null>;
}) {
  const readOnly = isRelationshipReadOnly(relationship.relationship_status);
  const [settlementDays, setSettlementDays] = useState(
    String(relationship.settlement_term_days),
  );
  const [creditLimit, setCreditLimit] = useState(
    String(relationship.credit_limit_minor),
  );
  const [ownerId, setOwnerId] = useState(
    relationship.tenant_owner_employee_id ?? "",
  );
  const [invoiceRequired, setInvoiceRequired] = useState(
    relationship.invoice_required_before_payment,
  );
  const [remark, setRemark] = useState(relationship.remark ?? "");
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    setSettlementDays(String(relationship.settlement_term_days));
    setCreditLimit(String(relationship.credit_limit_minor));
    setOwnerId(relationship.tenant_owner_employee_id ?? "");
    setInvoiceRequired(relationship.invoice_required_before_payment);
    setRemark(relationship.remark ?? "");
  }, [relationship]);

  async function save(expectedVersion = relationship.version) {
    setPending(true);
    setConflict(false);
    try {
      await requestBackendJson(`/suppliers/${relationship.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expected_version: expectedVersion,
          settlement_term_days: Number(settlementDays),
          credit_limit_minor: Number(creditLimit),
          invoice_required_before_payment: invoiceRequired,
          tenant_owner_employee_id: ownerId.trim() || null,
          remark: remark.trim() || null,
        }),
        fallbackMessage: "合作设置保存失败",
      });
      toast.success("合作设置已保存");
      onChanged();
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        setConflict(true);
      } else {
        toast.error(error instanceof Error ? error.message : "合作设置保存失败");
      }
    } finally {
      setPending(false);
    }
  }

  async function retryLatest() {
    const latest = await loadLatest();
    if (latest) await save(latest.version);
  }

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="text-sm font-semibold">供应商资料</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <ReadOnlyField label="供应商名称" value={relationship.supplier.name} />
          <ReadOnlyField label="供应商编码" value={relationship.supplier.code} />
          <ReadOnlyField label="法定名称" value={relationship.supplier.legal_name} />
          <ReadOnlyField
            label="供应商类型"
            value={supplierTypeLabel[relationship.supplier.supplier_type]}
          />
        </div>
      </section>
      <section className="border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">租户合作条款</h3>
          <TenantSupplierActions
            relationship={relationship}
            canManage={canManage}
            onChanged={onChanged}
            loadLatest={loadLatest}
          />
        </div>
        <FieldGroup className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="supplier-settlement-days">结算账期（天）</FieldLabel>
              <Input
                id="supplier-settlement-days"
                inputMode="numeric"
                value={settlementDays}
                disabled={!canManage || readOnly}
                onChange={(event) => setSettlementDays(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-credit-limit">授信额度（分）</FieldLabel>
              <Input
                id="supplier-credit-limit"
                inputMode="numeric"
                value={creditLimit}
                disabled={!canManage || readOnly}
                onChange={(event) => setCreditLimit(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-owner-id">租户负责人员工 ID</FieldLabel>
              <Input
                id="supplier-owner-id"
                value={ownerId}
                disabled={!canManage || readOnly}
                placeholder="留空表示未指定"
                onChange={(event) => setOwnerId(event.target.value)}
              />
            </Field>
            <Field className="flex-row items-center gap-4">
              <div className="flex-1">
                <FieldLabel htmlFor="supplier-invoice-required">
                  付款前要求发票
                </FieldLabel>
                <p className="text-xs text-muted-foreground">
                  开启后财务付款前需确认已取得发票。
                </p>
              </div>
              <Switch
                id="supplier-invoice-required"
                checked={invoiceRequired}
                disabled={!canManage || readOnly}
                onCheckedChange={setInvoiceRequired}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="supplier-relationship-remark">合作备注</FieldLabel>
            <Textarea
              id="supplier-relationship-remark"
              rows={3}
              maxLength={500}
              value={remark}
              disabled={!canManage || readOnly}
              onChange={(event) => setRemark(event.target.value)}
            />
          </Field>
        </FieldGroup>
        {conflict ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>数据版本已变化</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <p>请加载最新版本，再确认是否保存当前填写的条款。</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void loadLatest()}>
                  刷新最新数据
                </Button>
                <Button type="button" size="sm" disabled={pending} onClick={() => void retryLatest()}>
                  按最新版本重试保存
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {canManage && !readOnly ? (
          <div className="mt-4 flex justify-end">
            <Button type="button" disabled={pending} onClick={() => void save()}>
              {pending ? "正在保存" : "保存合作设置"}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value || "-"}</div>
    </div>
  );
}

function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => unknown;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>数据加载失败</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-3">
        <span>{message}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => void onRetry()}>
          重新加载
        </Button>
      </AlertDescription>
    </Alert>
  );
}

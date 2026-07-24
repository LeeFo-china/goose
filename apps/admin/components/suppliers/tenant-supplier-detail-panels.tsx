"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  blockingReasonLabel,
  formatDate,
  relationshipStatusMeta,
  type SupplierContract,
  type SupplierEvent,
  type TenantSupplierRelationship,
} from "./supplier-types";

export function ContractsPanel({
  contracts,
  page,
  totalPages,
  contractRequired,
  canManageContracts,
  onPageChange,
}: {
  contracts: SupplierContract[];
  page: number;
  totalPages: number;
  contractRequired: boolean;
  canManageContracts: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertTitle>新订单合同策略</AlertTitle>
        <AlertDescription>
          {contractRequired ? "创建新订单前必须存在生效合同。" : "当前不强制要求生效合同。"}
          {canManageContracts ? " 你拥有合同管理权限。" : " 当前账号仅可查看合同。"}
        </AlertDescription>
      </Alert>
      {contracts.length ? (
        <div className="rounded-md border">
          {contracts.map((contract) => (
            <div
              key={contract.id}
              className="flex flex-col gap-2 border-b p-3 last:border-b-0 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="font-medium">{contract.name}</div>
                <div className="text-xs text-muted-foreground">
                  {contract.contract_no}，{contract.valid_from} 至 {contract.valid_until}
                </div>
              </div>
              <Badge variant={contract.lifecycle_status === "active" ? "success" : "secondary"}>
                {contract.lifecycle_status === "active"
                  ? "生效中"
                  : contract.lifecycle_status === "draft"
                    ? "草稿"
                    : "已终止"}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          暂无供应商合同
        </p>
      )}
      <DetailPagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}

export function EligibilityPanel({
  relationship,
  eligibility,
}: {
  relationship: TenantSupplierRelationship;
  eligibility?: TenantSupplierRelationship["eligibility"];
}) {
  const blocking_reasons = eligibility?.blocking_reasons ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Alert variant={eligibility?.eligible ? "default" : "destructive"}>
        <AlertTitle>{eligibility?.eligible ? "当前可创建新订单" : "当前不可创建新订单"}</AlertTitle>
        <AlertDescription>
          系统会综合平台准入、运营状态、租户合作状态、必填资质和合同策略实时判断。
        </AlertDescription>
      </Alert>
      {blocking_reasons.length ? (
        <div className="rounded-md border">
          {blocking_reasons.map((reason) => (
            <div key={reason} className="border-b px-3 py-2 text-sm last:border-b-0">
              {blockingReasonLabel[reason]}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">没有阻止新订单的原因。</p>
      )}
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <div className="text-xs text-muted-foreground">合作状态</div>
        <div className="mt-1 text-sm font-medium">
          {relationshipStatusMeta[relationship.relationship_status].label}
        </div>
      </div>
    </div>
  );
}

export function ServiceRegionsPanel({
  relationship,
}: {
  relationship: TenantSupplierRelationship;
}) {
  return (
    <Alert>
      <AlertTitle>平台维护的服务区域</AlertTitle>
      <AlertDescription>
        服务区域属于平台供应商主数据，租户端只读。Phase 0 暂不提供租户侧区域明细接口，
        如需核对请联系平台运营并提供供应商编码 {relationship.supplier.code}。
      </AlertDescription>
    </Alert>
  );
}

export function EventsPanel({
  events,
  page,
  totalPages,
  onPageChange,
}: {
  events: SupplierEvent[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {events.length ? (
        <div className="rounded-md border">
          {events.map((event) => (
            <div key={event.id} className="border-b p-3 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{event.command}</span>
                <span className="text-xs text-muted-foreground">{formatDate(event.created_at)}</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {event.reason || "未填写原因"}，结果版本 {event.result_version}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          暂无操作记录
        </p>
      )}
      <DetailPagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}

function DetailPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, totalPages || 1);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">第 {page} / {pages} 页</span>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

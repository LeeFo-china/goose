"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import { listSupplierPayablesByIds } from "@/components/supplier-payables/payable-api";
import type { SupplierPayable } from "@/components/supplier-payables/payable-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { listSupplierPaymentRequests } from "./payment-request-api";
import { PaymentRequestDetail } from "./payment-request-detail";
import { PaymentRequestEditor } from "./payment-request-editor";
import { PaymentRequestFilters } from "./payment-request-filters";
import { PaymentRequestList } from "./payment-request-list";
import {
  buildPaymentRequestWorkspaceHref,
  errorMessage,
  paymentRequestCreatedDateRange,
  readPaymentRequestWorkspaceState,
  type PaymentRequestWorkspaceState,
  validateDraftPayables,
} from "./payment-request-page-utils";
import { supplierPaymentCommandRefresh } from "./payment-request-command-refresh";
import type {
  PaymentRequestAction,
  PaymentRequestPermissions,
  SupplierPaymentRequest,
  SupplierPaymentRequestDetail as PaymentRequestDetailData,
  SupplierPaymentRequestListItem,
  SupplierPaymentRequestPage,
} from "./payment-request-types";

const initialState: PaymentRequestWorkspaceState = {
  page: 1,
  keyword: "",
  status: "all",
  projectId: "all",
  tenantSupplierId: "all",
  createdFrom: "",
  createdTo: "",
  create: false,
  payableIds: [],
};
const emptyPage: SupplierPaymentRequestPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export function PaymentRequestWorkspace({
  canView,
  canManage,
  canApprove,
  canPay,
}: {
  canView: boolean;
  canManage: boolean;
  canApprove: boolean;
  canPay: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsed = useMemo(() => {
    try {
      return {
        state: readPaymentRequestWorkspaceState(searchParams),
        error: null,
      };
    } catch (caught) {
      return {
        state: initialState,
        error: errorMessage(caught, "无效的付款申请页面参数"),
      };
    }
  }, [searchParams]);
  const state = parsed.state;
  const [filterDraft, setFilterDraft] = useState(state);
  const [keyword, setKeyword] = useState(state.keyword);
  const [records, setRecords] = useState(emptyPage);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [createPayables, setCreatePayables] = useState<SupplierPayable[]>([]);
  const [editorDetail, setEditorDetail] =
    useState<PaymentRequestDetailData | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [detailRecord, setDetailRecord] =
    useState<SupplierPaymentRequestListItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [initialAction, setInitialAction] =
    useState<PaymentRequestAction | null>(null);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const listRequestVersion = useRef(0);
  const deepLinkVersion = useRef(0);
  const permissions = useMemo<PaymentRequestPermissions>(() => ({
    canManage,
    canApprove,
    canPay,
  }), [canApprove, canManage, canPay]);

  useEffect(() => {
    setFilterDraft(state);
    setKeyword(state.keyword);
  }, [state]);

  const loadRecords = useCallback(async () => {
    if (!canView) return;
    const version = ++listRequestVersion.current;
    setLoading(true);
    setListError(null);
    try {
      const next = await listSupplierPaymentRequests({
        page: state.page,
        pageSize: 20,
        ...(state.keyword ? { keyword: state.keyword } : {}),
        ...(state.status !== "all" ? { status: state.status } : {}),
        ...(state.projectId !== "all" ? { project_id: state.projectId } : {}),
        ...(state.tenantSupplierId !== "all"
          ? { tenant_supplier_id: state.tenantSupplierId }
          : {}),
        ...paymentRequestCreatedDateRange(
          state.createdFrom,
          state.createdTo,
        ),
      });
      if (listRequestVersion.current === version) setRecords(next);
    } catch (caught) {
      if (listRequestVersion.current === version) {
        setListError(errorMessage(caught, "付款申请列表加载失败"));
      }
    } finally {
      if (listRequestVersion.current === version) setLoading(false);
    }
  }, [canView, state]);

  useEffect(() => {
    void loadRecords();
    return () => {
      listRequestVersion.current += 1;
    };
  }, [loadRecords]);

  useEffect(() => {
    if (!canView || !state.create || parsed.error) return;
    const version = ++deepLinkVersion.current;
    if (!canManage) {
      setWorkspaceError("当前账号没有付款申请管理权限，无法创建申请。");
      router.replace(buildPaymentRequestWorkspaceHref(initialState));
      return;
    }
    setWorkspaceError(null);
    void listSupplierPayablesByIds(state.payableIds).then((facts) => {
      if (deepLinkVersion.current !== version) return;
      const verified = validateDraftPayables(state.payableIds, facts);
      setCreatePayables(verified);
      setEditorDetail(null);
      setEditorOpen(true);
      router.replace(buildPaymentRequestWorkspaceHref(initialState));
    }).catch((caught) => {
      if (deepLinkVersion.current === version) {
        setWorkspaceError(errorMessage(
          caught,
          "所选应付重新校验失败，请返回应付页面重新选择。",
        ));
      }
    });
    return () => {
      deepLinkVersion.current += 1;
    };
  }, [canManage, canView, parsed.error, router, state.create, state.payableIds]);

  function navigate(
    patch: Partial<PaymentRequestWorkspaceState>,
    resetPage = true,
  ) {
    router.push(buildPaymentRequestWorkspaceHref({
      ...state,
      ...patch,
      create: false,
      payableIds: [],
      page: resetPage ? 1 : patch.page ?? state.page,
    }));
  }

  function applyCommandResult(next: SupplierPaymentRequest) {
    setRecords((current) => {
      const currentItem = current.list.find(({ id }) => id === next.id);
      const supplierName = currentItem?.supplier_name ??
        createPayables[0]?.supplier_name ?? "供应商";
      const item: SupplierPaymentRequestListItem = {
        ...next,
        supplier_name: supplierName,
      };
      const exists = current.list.some(({ id }) => id === next.id);
      return {
        list: exists
          ? current.list.map((record) => record.id === next.id ? item : record)
          : [item, ...current.list].slice(0, 20),
        pagination: {
          ...current.pagination,
          total: current.pagination.total + (exists ? 0 : 1),
        },
      };
    });
    setDetailRecord((current) => current?.id === next.id
      ? { ...current, ...next }
      : current);
  }

  async function openEditorFromDetail(nextDetail: PaymentRequestDetailData) {
    setWorkspaceError(null);
    try {
      const ids = nextDetail.allocations.map(({ payable_event_id }) =>
        payable_event_id
      );
      const facts = await listSupplierPayablesByIds(ids);
      const verified = validateDraftPayables(ids, facts);
      setCreatePayables(verified);
      setEditorDetail(nextDetail);
      setDetailOpen(false);
      setEditorOpen(true);
    } catch (caught) {
      setWorkspaceError(errorMessage(
        caught,
        "付款申请应付事实重新校验失败，请刷新后重试。",
      ));
    }
  }

  function dispatchPaymentRefresh(requestId: string) {
    window.dispatchEvent(new CustomEvent("supplier-payment-command", {
      detail: { requestId, ...supplierPaymentCommandRefresh() },
    }));
    router.refresh();
  }

  if (!canView) {
    return (
      <StatusAlert>
        当前账号没有 supplier.payment-request.view 权限，无法查看付款申请。
      </StatusAlert>
    );
  }

  const totalPages = Math.max(1, records.pagination.totalPages || 1);
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-normal">供应商付款申请</h1>
        <p className="text-sm text-muted-foreground">
          管理应付申请、审批、付款凭证和未付尾款。
        </p>
      </div>
      {!canManage && !canApprove && !canPay ? (
        <StatusAlert tone="warning">当前账号仅可查看付款申请，所有命令操作已隐藏。</StatusAlert>
      ) : null}
      {parsed.error || workspaceError || listError ? (
        <StatusAlert>{parsed.error ?? workspaceError ?? listError}</StatusAlert>
      ) : null}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-muted/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>付款申请列表</CardTitle>
              <CardDescription>服务端分页，每页 20 条；命令期间锁定同一申请全部动作。</CardDescription>
            </div>
            <Badge variant="outline">共 {records.pagination.total} 条</Badge>
          </div>
          <PaymentRequestFilters
            state={filterDraft}
            keyword={keyword}
            loading={loading}
            onKeywordChange={setKeyword}
            onChange={(patch) => setFilterDraft((current) => ({ ...current, ...patch }))}
            onSearch={() => navigate({ ...filterDraft, keyword: keyword.trim() })}
            onReset={() => {
              setFilterDraft(initialState);
              setKeyword("");
              navigate(initialState);
            }}
          />
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <PaymentRequestList
              records={records.list}
              loading={loading}
              permissions={permissions}
              pendingRequestId={pendingRequestId}
              onOpen={(record) => {
                setInitialAction(null);
                setDetailRecord(record);
                setDetailOpen(true);
              }}
              onAction={(record, action) => {
                setInitialAction(action);
                setDetailRecord(record);
                setDetailOpen(true);
              }}
            />
          </div>
          <Separator />
          <div className="shrink-0 flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <span className="text-sm tabular-nums text-muted-foreground">
              第 {records.pagination.page} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={loading || state.page <= 1}
                onClick={() => navigate({ page: state.page - 1 }, false)}
              >
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading || state.page >= totalPages}
                onClick={() => navigate({ page: state.page + 1 }, false)}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      {canManage ? (
        <PaymentRequestEditor
          open={editorOpen}
          payables={createPayables}
          detail={editorDetail}
          projectName={createPayables[0]?.project_name}
          supplierName={createPayables[0]?.supplier_name ?? detailRecord?.supplier_name}
          pending={pendingRequestId !== null}
          onOpenChange={setEditorOpen}
          onPendingChange={setPendingRequestId}
          onRefresh={() => {
            setEditorOpen(false);
            void loadRecords();
          }}
          onSaved={(next) => {
            applyCommandResult(next);
            dispatchPaymentRefresh(next.id);
            void loadRecords();
          }}
        />
      ) : null}
      <PaymentRequestDetail
        open={detailOpen}
        record={detailRecord}
        permissions={permissions}
        pendingRequestId={pendingRequestId}
        initialAction={initialAction}
        onInitialActionConsumed={() => setInitialAction(null)}
        onPendingChange={setPendingRequestId}
        onOpenChange={(nextOpen) => {
          setDetailOpen(nextOpen);
          if (!nextOpen) setInitialAction(null);
        }}
        onEdit={(nextDetail) => void openEditorFromDetail(nextDetail)}
        onChanged={(next) => {
          applyCommandResult(next);
          void loadRecords();
        }}
      />
    </div>
  );
}

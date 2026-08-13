"use client";

import type { SupplierType } from "@gooes/domain";
import { Building2, Plus, Search, Store, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field, FieldDescription, FieldError, FieldGroup, FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { requestBackendJson } from "@/lib/backend-client";

import {
  allocateTenantSupplierCode,
  createTenantPrivateSupplier,
  createTenantSharedRelationship,
  isSupplierCodeConflict,
  isSupplierIdentityConflict,
  manualSupplierCodeState,
  type SupplierCodeState,
} from "./supplier-create-api";
import {
  newIdempotencyKey, supplierTypeLabel, type PageData,
  type SupplierDirectoryItem,
} from "./supplier-types";

type CreateMode = "shared" | "private";
type PrivateForm = {
  name: string;
  legalName: string;
  creditCode: string;
  supplierType: SupplierType;
};

const emptyDirectory: PageData<SupplierDirectoryItem> = {
  list: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
};
const emptyPrivateForm: PrivateForm = {
  name: "",
  legalName: "",
  creditCode: "",
  supplierType: "manufacturer",
};

export function AddSupplierDialog({
  disabled,
  sharedCreationEnabled,
  privateCreationEnabled,
  codeAllocationEnabled,
  onCreated,
}: {
  disabled?: boolean;
  sharedCreationEnabled: boolean;
  privateCreationEnabled: boolean;
  codeAllocationEnabled: boolean;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CreateMode | null>(null);
  const [keyword, setKeyword] = useState("");
  const [directory, setDirectory] = useState(emptyDirectory);
  const [privateForm, setPrivateForm] = useState(emptyPrivateForm);
  const [codeState, setCodeState] = useState<SupplierCodeState>(
    manualSupplierCodeState(""),
  );
  const [loading, setLoading] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [creditCodeError, setCreditCodeError] = useState<string | null>(null);
  const allocationRequestRef = useRef(0);

  const loadDirectory = useCallback(async (page: number, search: string) => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (search.trim()) query.set("keyword", search.trim());
    try {
      setDirectory(await requestBackendJson<PageData<SupplierDirectoryItem>>(
        `/suppliers/directory?${query}`,
        { fallbackMessage: "平台共享供应商目录加载失败" },
      ));
    } catch (caught) {
      setError(messageOf(caught, "平台共享供应商目录加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && mode === "shared") void loadDirectory(1, "");
  }, [loadDirectory, mode, open]);

  function reset() {
    allocationRequestRef.current += 1;
    setAllocating(false);
    setMode(null);
    setKeyword("");
    setDirectory(emptyDirectory);
    setPrivateForm(emptyPrivateForm);
    setCodeState(manualSupplierCodeState(""));
    setError(null);
    setCodeError(null);
    setCreditCodeError(null);
  }

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function selectMode(nextMode: CreateMode) {
    allocationRequestRef.current += 1;
    setAllocating(false);
    setMode(nextMode);
    setCodeState(manualSupplierCodeState(""));
    setCodeError(null);
    setCreditCodeError(null);
    setError(null);
  }

  function changeCode(value: string) {
    setCodeState(manualSupplierCodeState(value));
    setCodeError(null);
  }

  async function generateCode() {
    if (!codeAllocationEnabled || allocating) return;
    const requestId = allocationRequestRef.current + 1;
    allocationRequestRef.current = requestId;
    setAllocating(true);
    setCodeError(null);
    try {
      const allocation = await allocateTenantSupplierCode(
        newIdempotencyKey("tenant-supplier-code-allocation"),
      );
      if (allocationRequestRef.current !== requestId) return;
      setCodeState({
        code_source: "generated",
        internal_supplier_code: allocation.code,
        allocation_id: allocation.allocation_id,
      });
    } catch (caught) {
      if (allocationRequestRef.current !== requestId) return;
      setCodeError(messageOf(caught, "生成供应商内部编码失败"));
    } finally {
      if (allocationRequestRef.current === requestId) setAllocating(false);
    }
  }

  function validCode() {
    if (/^[A-Z0-9_-]{2,64}$/.test(codeState.internal_supplier_code)) {
      return true;
    }
    setCodeError("请输入 2 到 64 位大写字母、数字、下划线或连字符");
    return false;
  }

  async function createShared(supplier: SupplierDirectoryItem) {
    if (allocating || !validCode()) return;
    setCreatingId(supplier.id);
    setCodeError(null);
    try {
      await createTenantSharedRelationship(
        { supplier_id: supplier.id, ...codeState },
        newIdempotencyKey("tenant-shared-supplier-create"),
      );
      toast.success("已添加平台共享供应商，当前状态为评估中");
      changeOpen(false);
      onCreated();
    } catch (caught) {
      if (isSupplierCodeConflict(caught)) {
        setCodeError(messageOf(caught, "供应商内部编码已存在"));
      } else toast.error(messageOf(caught, "添加平台共享供应商失败"));
    } finally {
      setCreatingId(null);
    }
  }

  async function createPrivate() {
    if (!privateForm.name.trim() || !privateForm.legalName.trim()) {
      setError("请填写供应商名称和法定名称");
      return;
    }
    if (!validCode()) return;
    setCreatingId("private");
    setError(null);
    setCreditCodeError(null);
    try {
      await createTenantPrivateSupplier({
        name: privateForm.name.trim(),
        legal_name: privateForm.legalName.trim(),
        supplier_type: privateForm.supplierType,
        ...(privateForm.creditCode.trim()
          ? { unified_social_credit_code: privateForm.creditCode.trim() }
          : {}),
        ...codeState,
      }, newIdempotencyKey("tenant-private-supplier-create"));
      toast.success("已新建租户私有供应商");
      changeOpen(false);
      onCreated();
    } catch (caught) {
      if (isSupplierCodeConflict(caught)) {
        setCodeError(messageOf(caught, "供应商内部编码已存在"));
      } else if (isSupplierIdentityConflict(caught)) {
        setCreditCodeError(messageOf(caught, "当前租户已存在相同主体的私有供应商"));
      } else setError(messageOf(caught, "新建租户私有供应商失败"));
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          <Plus data-icon="inline-start" />添加合作供应商
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(88vh,760px)] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>添加合作供应商</DialogTitle>
          <DialogDescription>
            平台共享资料可被所有租户选用；租户私有资料只属于当前租户。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2" role="group"
          aria-label="供应商资料来源">
          <ModeButton active={mode === "shared"}
            disabled={!sharedCreationEnabled}
            onClick={() => selectMode("shared")}
            icon={<Building2 className="size-5" />} title="添加平台共享供应商"
            description={sharedCreationEnabled
              ? "从平台已准入目录建立合作关系"
              : "需要供应商合作关系管理权限"} />
          <ModeButton active={mode === "private"}
            disabled={!privateCreationEnabled}
            onClick={() => selectMode("private")}
            icon={<Store className="size-5" />} title="新建私有供应商"
            description={privateCreationEnabled
              ? "创建仅当前租户可见和维护的资料"
              : "需要私有供应商主档权限并启用私有写入"} />
        </div>

        {mode ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            <SupplierCodeField value={codeState.internal_supplier_code}
              generated={codeState.code_source === "generated"}
              allocating={allocating} allocationEnabled={codeAllocationEnabled}
              error={codeError}
              onChange={changeCode} onGenerate={() => void generateCode()} />
            {mode === "shared" ? (
              <SharedDirectory keyword={keyword} setKeyword={setKeyword}
                directory={directory} loading={loading} error={error}
                creatingId={creatingId} allocating={allocating}
                loadDirectory={loadDirectory}
                createShared={createShared} />
            ) : (
              <PrivateSupplierFields form={privateForm} setForm={setPrivateForm}
                error={error} creditCodeError={creditCodeError}
                onCreditCodeChange={(value) => {
                  setPrivateForm((current) => ({ ...current, creditCode: value }));
                  setCreditCodeError(null);
                }} />
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            请先选择供应商资料来源
          </div>
        )}

        {mode === "private" ? (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => changeOpen(false)}>取消</Button>
            <Button type="button" disabled={creatingId !== null || allocating}
              onClick={() => void createPrivate()}>
              {creatingId === "private" ? "正在创建" : "创建私有供应商"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ModeButton(props: {
  active: boolean; onClick: () => void; icon: React.ReactNode;
  title: string; description: string; disabled?: boolean;
}) {
  return <button type="button" aria-pressed={props.active}
    aria-disabled={props.disabled}
    onClick={() => !props.disabled && props.onClick()}
    className={`rounded-md border p-4 text-left transition-colors ${
      props.active ? "border-primary bg-primary/5" : "hover:bg-muted/50"
    } aria-disabled:cursor-not-allowed aria-disabled:opacity-50`}>
    <span className="flex items-center gap-2 font-medium">{props.icon}{props.title}</span>
    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{props.description}</span>
  </button>;
}

function SupplierCodeField(props: {
  value: string; generated: boolean; allocating: boolean;
  allocationEnabled: boolean; error: string | null;
  onChange: (value: string) => void; onGenerate: () => void;
}) {
  return <Field data-invalid={Boolean(props.error)}>
    <FieldLabel htmlFor="tenant-supplier-internal-code">供应商内部编码</FieldLabel>
    <div className="flex gap-2">
      <Input id="tenant-supplier-internal-code" value={props.value}
        aria-invalid={Boolean(props.error)}
        aria-describedby={props.error ? "tenant-supplier-code-error" : undefined}
        placeholder="例如 SUP-000001"
        onChange={(event) => props.onChange(event.target.value)} />
      <Button type="button" variant="outline"
        disabled={!props.allocationEnabled || props.allocating}
        onClick={() => props.allocationEnabled && props.onGenerate()}>
        <WandSparkles data-icon="inline-start" />
        {props.allocating ? "生成中" : "自动生成"}
      </Button>
    </div>
    <FieldDescription>
      {props.generated
        ? "已自动生成；如手工修改，将改用手工编码提交。"
        : props.allocationEnabled
          ? "可自行填写，也可点击自动生成。系统不会因留空自动生成。"
          : "可自行填写；自动生成需要私有供应商主档权限并启用私有写入。"}
    </FieldDescription>
    <FieldError id="tenant-supplier-code-error" role="alert">
      {props.error}
    </FieldError>
  </Field>;
}

function SharedDirectory(props: {
  keyword: string; setKeyword: (value: string) => void;
  directory: PageData<SupplierDirectoryItem>; loading: boolean;
  error: string | null; creatingId: string | null; allocating: boolean;
  loadDirectory: (page: number, search: string) => Promise<void>;
  createShared: (supplier: SupplierDirectoryItem) => Promise<void>;
}) {
  const page = props.directory.pagination;
  return <>
    <Field>
      <FieldLabel htmlFor="supplier-directory-keyword">搜索平台共享供应商</FieldLabel>
      <div className="flex gap-2">
        <Input id="supplier-directory-keyword" value={props.keyword}
          placeholder="供应商名称、编码或法定名称"
          onChange={(event) => props.setKeyword(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" &&
            void props.loadDirectory(1, props.keyword)} />
        <Button type="button" variant="outline" disabled={props.loading}
          onClick={() => void props.loadDirectory(1, props.keyword)}>
          <Search data-icon="inline-start" />搜索
        </Button>
      </div>
    </Field>
    <div className="min-h-48 rounded-md border">
      {props.loading ? <div className="space-y-2 p-3"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        : props.error ? <div className="p-4 text-sm text-destructive">{props.error}</div>
        : props.directory.list.length ? <div className="divide-y">{props.directory.list.map((supplier) =>
          <div key={supplier.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0"><div className="truncate font-medium">{supplier.name}</div>
              <div className="mt-1 flex gap-2 text-xs text-muted-foreground"><span>{supplier.code}</span>
                <Badge variant="outline">{supplierTypeLabel[supplier.supplier_type]}</Badge></div></div>
            <Button type="button" size="sm" variant="outline"
              disabled={props.creatingId !== null || props.allocating}
              onClick={() => void props.createShared(supplier)}>
              {props.creatingId === supplier.id ? "正在添加" : "建立合作"}
            </Button>
          </div>)}</div>
        : <div className="p-8 text-center text-sm text-muted-foreground">没有可添加的供应商</div>}
    </div>
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>第 {page.page} / {Math.max(1, page.totalPages)} 页，共 {page.total} 个</span>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={props.loading || page.page <= 1}
          onClick={() => void props.loadDirectory(page.page - 1, props.keyword)}>上一页</Button>
        <Button type="button" size="sm" variant="outline"
          disabled={props.loading || page.page >= Math.max(1, page.totalPages)}
          onClick={() => void props.loadDirectory(page.page + 1, props.keyword)}>下一页</Button>
      </div>
    </div>
  </>;
}

function PrivateSupplierFields(props: {
  form: PrivateForm; setForm: React.Dispatch<React.SetStateAction<PrivateForm>>;
  error: string | null; creditCodeError: string | null;
  onCreditCodeChange: (value: string) => void;
}) {
  const set = (field: keyof PrivateForm, value: string) =>
    props.setForm((current) => ({ ...current, [field]: value }));
  return <FieldGroup>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field><FieldLabel htmlFor="private-supplier-name">供应商名称</FieldLabel>
        <Input id="private-supplier-name" value={props.form.name}
          onChange={(event) => set("name", event.target.value)} /></Field>
      <Field><FieldLabel htmlFor="private-supplier-legal-name">法定名称</FieldLabel>
        <Input id="private-supplier-legal-name" value={props.form.legalName}
          onChange={(event) => set("legalName", event.target.value)} /></Field>
      <Field><FieldLabel htmlFor="private-supplier-type">供应商类型</FieldLabel>
        <Select value={props.form.supplierType}
          onValueChange={(value) => set("supplierType", value)}>
          <SelectTrigger id="private-supplier-type"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            {Object.entries(supplierTypeLabel).map(([value, label]) =>
              <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select></Field>
      <Field data-invalid={Boolean(props.creditCodeError)}>
        <FieldLabel htmlFor="private-supplier-credit-code">统一社会信用代码</FieldLabel>
        <Input id="private-supplier-credit-code" value={props.form.creditCode}
          aria-invalid={Boolean(props.creditCodeError)}
          aria-describedby={props.creditCodeError
            ? "private-supplier-credit-code-error" : undefined}
          placeholder="选填"
          onChange={(event) =>
            props.onCreditCodeChange(event.target.value.toUpperCase())} />
        <FieldError id="private-supplier-credit-code-error" role="alert">
          {props.creditCodeError}
        </FieldError>
      </Field>
    </div>
    <FieldError>{props.error}</FieldError>
  </FieldGroup>;
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

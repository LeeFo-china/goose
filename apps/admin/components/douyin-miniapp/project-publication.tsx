"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Images,
  Loader2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import {
  PROJECT_PUBLICATION_MAX_IMAGES as MAX_IMAGES,
  PROJECT_PUBLICATION_PAGE_SIZE as PAGE_SIZE,
  buildProjectPublicationHref,
  candidateImageAccessibleLabel,
  clearImageSelection,
  createRequestAuthority,
  emptyCandidatePage,
  emptyPublicationDraft,
  getCollectionViewState,
  getPublicationReadinessWarnings,
  getPublicationRefreshPage,
  getPublicationSaveWarnings,
  getSelectedImageItems,
  isAbortError,
  normalizeCandidatePage,
  normalizeProjectPage,
  normalizeSavedProjectProfile,
  publicationSubmitLabel,
  projectPhaseDisplay,
  projectProfileDraft,
  safeHttpsPreview,
  updateImageSelection,
  type CandidateImage,
  type CandidatePage,
  type ProjectProfile,
  type ProjectPublicationDraft,
  type ProjectPublicationPage,
  type ProjectPublicationRow,
  type PublicationStatus,
} from "./project-publication-logic";

export function ProjectPublication({
  initialData,
  initialError,
  initialPublicationStatus,
}: {
  initialData: ProjectPublicationPage;
  initialError: string | null;
  initialPublicationStatus: string;
}) {
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState(initialPublicationStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [editing, setEditing] = useState<ProjectPublicationRow | null>(null);
  const listAuthority = useRef(createRequestAuthority()).current;

  const loadPage = useCallback(async (
    page: number,
    nextStatus: string,
    statusChanged = false,
  ) => {
    const request = listAuthority.begin();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (nextStatus) query.set("publicationStatus", nextStatus);
    try {
      const raw = await requestBackendJson<unknown>(
        `/tenant/douyin-miniapp/projects?${query}`,
        {
          cache: "no-store",
          fallbackMessage: "项目实景内容加载失败",
          signal: request.controller.signal,
        },
      );
      if (!listAuthority.isCurrent(request)) return;
      const next = normalizeProjectPage(raw, { page, pageSize: PAGE_SIZE });
      if (!next) throw new Error("项目列表分页数据无效，请刷新后重试");
      setData(next);
      window.history.replaceState(null, "", buildProjectPublicationHref({
        page,
        publicationStatus: nextStatus,
        statusChanged,
      }));
    } catch (loadError) {
      if (isAbortError(loadError) || !listAuthority.isCurrent(request)) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : "项目实景内容加载失败",
      );
    } finally {
      if (listAuthority.isCurrent(request)) setLoading(false);
    }
  }, [listAuthority]);

  useEffect(() => () => listAuthority.invalidate(), [listAuthority]);

  const listView = getCollectionViewState({
    loading,
    error,
    itemCount: data.list.length,
  });

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <header className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
          <Images aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-normal">项目实景内容</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            选择项目已有实景图片，维护抖音小程序公开标题、说明与发布状态。当前筛选共 {data.pagination.total} 条。
          </p>
        </div>
      </header>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b bg-muted/20 p-3">
          <div>
            <CardTitle>项目公开资料</CardTitle>
            <CardDescription>发布前需完善标题、说明，并选择至少 3 张项目图片。</CardDescription>
          </div>
          <Field className="w-36">
            <FieldLabel className="sr-only" htmlFor="project-publication-status-filter">
              筛选发布状态
            </FieldLabel>
            <FormSelect
              id="project-publication-status-filter"
              value={status || "all"}
              disabled={loading}
              options={[
                { value: "all", label: "全部状态" },
                { value: "draft", label: "草稿" },
                { value: "published", label: "已发布" },
                { value: "hidden", label: "已隐藏" },
              ]}
              onChange={(value) => {
                const nextStatus = value === "all" ? "" : value;
                setStatus(nextStatus);
                void loadPage(1, nextStatus, true);
              }}
            />
          </Field>
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            {listView === "error" ? <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-5"><StatusAlert>{error}</StatusAlert><Button variant="outline" onClick={() => void loadPage(data.pagination.page, status)}>重新加载项目列表</Button></div> : null}
            {listView === "loading" ? <ProjectTableSkeleton /> : null}
            {listView === "empty" || listView === "ready" ? <ProjectTable rows={data.list} onEdit={setEditing} /> : null}
          </div>
          {loading && listView === "ready" ? (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/65 pt-8 backdrop-blur-[1px]">
              <span className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新列表
              </span>
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="shrink-0 flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="tabular-nums">
                第 {data.pagination.page} / {Math.max(data.pagination.totalPages, 1)} 页
              </Badge>
              <span className="tabular-nums">
                当前显示 {data.list.length} 条，共 {data.pagination.total} 条
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={loading || data.pagination.page <= 1}
                onClick={() => void loadPage(data.pagination.page - 1, status)}
              >
                <ChevronLeft data-icon="inline-start" />
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  loading || data.pagination.page >= data.pagination.totalPages
                }
                onClick={() => void loadPage(data.pagination.page + 1, status)}
              >
                下一页
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
        </CardFooter>
      </Card>
      <PublicationDialog
        project={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={(profile) => {
          const refreshPage = getPublicationRefreshPage({
            activeStatus: status,
            currentPage: data.pagination.page,
            currentPageRowCount: data.list.length,
            savedStatus: profile.publication_status,
          });
          setEditing(null);
          if (refreshPage !== null) {
            void loadPage(refreshPage, status);
            return;
          }
          setData((current) => ({
            ...current,
            list: current.list.map((row) =>
              row.id === editing?.id
                ? { ...row, public_profile: profile }
                : row
            ),
          }));
        }}
      />
    </div>
  );
}

function ProjectTable({
  rows,
  onEdit,
}: {
  rows: ProjectPublicationRow[];
  onEdit(row: ProjectPublicationRow): void;
}) {
  if (rows.length === 0) {
    return (
      <Empty className="h-full rounded-none border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Images /></EmptyMedia>
          <EmptyTitle>暂无项目</EmptyTitle>
          <EmptyDescription>当前发布状态下没有可维护的项目。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Table className="min-w-[980px]" containerClassName="h-full">
      <TableHeader className="sticky top-0 bg-muted/60">
        <TableRow>
          <TableHead>项目</TableHead>
          <TableHead>项目阶段</TableHead>
          <TableHead>发布状态</TableHead>
          <TableHead>图片</TableHead>
          <TableHead>完整性</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{rows.map((row) => {
        const warnings = getPublicationReadinessWarnings(
          row,
          projectProfileDraft(row),
        );
        const phase = projectPhaseDisplay(row.status);
        return <TableRow key={row.id}>
          <TableCell><div className="min-w-[220px]"><p className="font-medium">{row.name?.trim() || "未命名项目"}</p><p className="mt-1 text-xs text-muted-foreground">{row.property?.community || "未填写小区"}{row.property?.layout ? ` · ${row.property.layout}` : ""}</p></div></TableCell>
          <TableCell><Badge variant={phase.variant}>{phase.label}</Badge></TableCell>
          <TableCell><Badge variant={publicationVariant(row.public_profile?.publication_status)}>{publicationLabel(row.public_profile?.publication_status)}</Badge></TableCell>
          <TableCell className="tabular-nums">已选图片 {row.public_profile?.public_image_urls.length ?? 0} 张</TableCell>
          <TableCell>{warnings.length ? <span className="text-sm text-destructive">{warnings.join("；")}</span> : <span className="text-sm text-success">允许发布</span>}</TableCell>
          <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => onEdit(row)}><Pencil data-icon="inline-start" />编辑公开资料</Button></TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
  );
}

function PublicationDialog({ project, onOpenChange, onSaved }: { project: ProjectPublicationRow | null; onOpenChange(open: boolean): void; onSaved(profile: ProjectProfile): void }) {
  const [draft, setDraft] = useState<ProjectPublicationDraft>(() => emptyPublicationDraft());
  const [candidates, setCandidates] = useState<CandidatePage>(emptyCandidatePage());
  const [candidatePage, setCandidatePage] = useState(1);
  const [styleTagsInput, setStyleTagsInput] = useState("");
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const candidateAuthority = useRef(createRequestAuthority()).current;

  const loadCandidates = useCallback(async (activeProject: ProjectPublicationRow, page: number) => {
    const request = candidateAuthority.begin();
    setCandidatePage(page);
    setCandidateLoading(true);
    setCandidateError(null);
    try {
      const raw = await requestBackendJson<unknown>(`/tenant/douyin-miniapp/projects/${activeProject.id}/images?page=${page}&pageSize=${PAGE_SIZE}`, { cache: "no-store", fallbackMessage: "项目图片加载失败", signal: request.controller.signal });
      if (!candidateAuthority.isCurrent(request)) return;
      const next = normalizeCandidatePage(raw, { page, pageSize: PAGE_SIZE });
      if (!next) throw new Error("项目图片分页数据无效，请重新加载");
      setCandidates(next);
    } catch (loadError) {
      if (isAbortError(loadError) || !candidateAuthority.isCurrent(request)) return;
      setCandidateError(loadError instanceof Error ? loadError.message : "项目图片加载失败");
    } finally {
      if (candidateAuthority.isCurrent(request)) setCandidateLoading(false);
    }
  }, [candidateAuthority]);

  useEffect(() => {
    candidateAuthority.invalidate();
    setCandidateLoading(false);
    if (!project) return;
    const nextDraft = projectProfileDraft(project);
    setDraft(nextDraft);
    setStyleTagsInput(nextDraft.style_tags.join("，"));
    setCandidates(emptyCandidatePage());
    setCandidatePage(1);
    setCandidateError(null);
    setMutationError(null);
    void loadCandidates(project, 1);
    return () => candidateAuthority.invalidate();
  }, [candidateAuthority, loadCandidates, project]);

  function handleOpenChange(open: boolean) {
    if (!open && !saving) {
      candidateAuthority.invalidate();
      setCandidateLoading(false);
      onOpenChange(false);
    }
  }

  const isPublished = draft.publication_status === "published";
  const warnings = project ? getPublicationSaveWarnings(project, draft) : [];
  const hasTitleError = draft.public_title.trim().length < 2 || draft.public_title.trim().length > 100;
  const hasDescriptionError = draft.public_description.trim().length < 20 || draft.public_description.trim().length > 2000;
  const hasStyleTagError = draft.style_tags.some((tag) => tag.trim().length < 1 || tag.trim().length > 40);
  const hasTooManyStyleTags = draft.style_tags.length > 8;
  const hasRequiredStyleTagError = isPublished && draft.style_tags.length === 0;
  const hasBudgetError = (draft.budget_band !== null && !draft.budget_band.trim()) || (draft.budget_band?.trim().length ?? 0) > 80 || (isPublished && !draft.budget_band?.trim());
  const hasImageError = isPublished && draft.public_image_urls.length < 3;
  const candidateView = getCollectionViewState({ loading: candidateLoading, error: candidateError, itemCount: candidates.items.length });
  const selectedImages = getSelectedImageItems(draft.public_image_urls, candidates.items);
  const takingOffline = project?.public_profile?.publication_status === "published" && !isPublished;

  async function save() {
    if (!project || warnings.length > 0) return;
    setSaving(true);
    setMutationError(null);
    try {
      const response = await requestBackendJson<unknown>(`/tenant/douyin-miniapp/projects/${project.id}/publication`, { method: "PATCH", body: JSON.stringify(draft), fallbackMessage: "公开资料保存失败" });
      const profile = normalizeSavedProjectProfile(response);
      if (!profile) throw new Error("公开资料保存结果无效，请刷新后确认");
      onSaved(profile);
      toast.success(isPublished ? "项目实景已发布" : "项目公开资料已保存");
    } catch (saveError) {
      setMutationError(saveError instanceof Error ? saveError.message : "公开资料保存失败");
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open={Boolean(project)} onOpenChange={handleOpenChange}>
    <DialogContent className="grid max-h-[90vh] max-w-[860px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
      <DialogHeader className="border-b p-5"><DialogTitle>编辑项目公开资料</DialogTitle><DialogDescription>{project?.name || "未命名项目"}，只可选择当前项目已有图片，保存时保留原始图片引用。</DialogDescription></DialogHeader>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
        <FieldGroup>
          <Field data-invalid={hasTitleError || undefined}><FieldLabel htmlFor="publication-title">公开标题</FieldLabel><Input id="publication-title" required aria-required="true" aria-describedby="publication-title-help publication-title-error" maxLength={100} disabled={saving} aria-invalid={hasTitleError} value={draft.public_title} onChange={(event) => setDraft({ ...draft, public_title: event.target.value })} /><FieldDescription id="publication-title-help">用于抖音小程序公开展示，2 至 100 个字符。</FieldDescription><div id="publication-title-error"><FieldError>{hasTitleError ? "请输入 2 至 100 个字符" : null}</FieldError></div></Field>
          <Field data-invalid={hasDescriptionError || undefined}><FieldLabel htmlFor="publication-description">公开说明</FieldLabel><Textarea id="publication-description" required aria-required="true" aria-describedby="publication-description-help publication-description-error" maxLength={2000} disabled={saving} aria-invalid={hasDescriptionError} value={draft.public_description} onChange={(event) => setDraft({ ...draft, public_description: event.target.value })} /><FieldDescription id="publication-description-help">{draft.public_description.trim().length}/2000 字符，至少 20 个字符。</FieldDescription><div id="publication-description-error"><FieldError>{hasDescriptionError ? "请输入 20 至 2000 个字符" : null}</FieldError></div></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field data-invalid={hasStyleTagError || hasTooManyStyleTags || hasRequiredStyleTagError || undefined}><FieldLabel htmlFor="publication-tags">风格标签</FieldLabel><Input id="publication-tags" required={isPublished} aria-required={isPublished} aria-describedby="publication-tags-help publication-tags-error" aria-invalid={hasStyleTagError || hasTooManyStyleTags || hasRequiredStyleTagError} disabled={saving} placeholder="现代，简约，原木" value={styleTagsInput} onChange={(event) => { setStyleTagsInput(event.target.value); setDraft({ ...draft, style_tags: parseTags(event.target.value) }); }} /><FieldDescription id="publication-tags-help">发布至少填写 1 个；最多 8 个，每个 1 至 40 个字符。</FieldDescription><div id="publication-tags-error"><FieldError>{hasRequiredStyleTagError ? "发布前至少填写 1 个风格标签" : hasTooManyStyleTags ? "风格标签最多选择 8 个" : hasStyleTagError ? "每个风格标签需为 1 至 40 个字符" : null}</FieldError></div></Field>
            <Field data-invalid={hasBudgetError || undefined}><FieldLabel htmlFor="publication-budget">预算区间</FieldLabel><Input id="publication-budget" required={isPublished} aria-required={isPublished} aria-describedby="publication-budget-help publication-budget-error" aria-invalid={hasBudgetError} maxLength={80} disabled={saving} placeholder="例如 20-30 万" value={draft.budget_band ?? ""} onChange={(event) => setDraft({ ...draft, budget_band: event.target.value || null })} /><FieldDescription id="publication-budget-help">发布时必填，最多 80 个字符。</FieldDescription><div id="publication-budget-error"><FieldError>{hasBudgetError ? isPublished ? "发布前请填写预算区间" : "预算区间填写后不能为空" : null}</FieldError></div></Field>
          </div>
          <Field><FieldLabel htmlFor="publication-status">发布状态</FieldLabel><FormSelect id="publication-status" aria-required="true" aria-describedby="publication-status-help" disabled={saving} value={draft.publication_status} options={[{ value: "draft", label: "草稿" }, { value: "published", label: "已发布" }, { value: "hidden", label: "已隐藏" }]} onChange={(value) => setDraft({ ...draft, publication_status: value as PublicationStatus })} /><FieldDescription id="publication-status-help">草稿和隐藏不会在抖音小程序公开展示。</FieldDescription></Field>
        </FieldGroup>

        <FieldSet aria-required={isPublished} aria-describedby="publication-images-help publication-images-error" data-invalid={hasImageError || undefined}>
          <FieldLegend className="mb-0 text-sm">项目图片</FieldLegend>
          <div className="flex flex-wrap items-center justify-between gap-2"><FieldDescription id="publication-images-help">已选图片 {draft.public_image_urls.length} / {MAX_IMAGES} 张；发布至少 3 张，翻页不清空。</FieldDescription><Badge variant={draft.public_image_urls.length >= 3 ? "success" : "warning"}>发布至少 3 张</Badge></div>
          <div className="rounded-md border p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">已选择图片</p><Button type="button" size="sm" variant="ghost" disabled={saving || draft.public_image_urls.length === 0} onClick={() => setDraft({ ...draft, public_image_urls: clearImageSelection() })}>全部清空</Button></div>{selectedImages.length ? <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">{selectedImages.map((item) => <SelectedImageOption key={item.reference} item={item} disabled={saving} onRemove={() => setDraft({ ...draft, public_image_urls: updateImageSelection(draft.public_image_urls, item.reference, false) })} />)}</div> : <p className="mt-2 text-xs text-muted-foreground">尚未选择图片。</p>}</div>
          {candidateView === "error" ? <div className="flex flex-col items-start gap-3"><StatusAlert>{candidateError}</StatusAlert><Button type="button" variant="outline" disabled={!project} onClick={() => project && void loadCandidates(project, candidatePage)}>重新加载项目图片</Button></div> : null}
          {candidateView === "loading" ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="aspect-[4/3] w-full" />)}</div> : null}
          {candidateView === "empty" ? <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><ImageOff /></EmptyMedia><EmptyTitle>暂无可选图片</EmptyTitle><EmptyDescription>请先在该项目的施工日志中上传实景图片。</EmptyDescription></EmptyHeader></Empty> : null}
          {candidateView === "ready" ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{candidates.items.map((item, index) => <CandidateImageOption key={item.reference} item={item} accessibleName={candidateImageAccessibleLabel({ page: candidates.pagination.page, pageSize: candidates.pagination.pageSize, index })} checked={draft.public_image_urls.includes(item.reference)} disabled={saving || candidateLoading || (!draft.public_image_urls.includes(item.reference) && draft.public_image_urls.length >= MAX_IMAGES)} onCheckedChange={(checked) => setDraft({ ...draft, public_image_urls: updateImageSelection(draft.public_image_urls, item.reference, checked) })} />)}</div> : null}
          {candidateView !== "error" ? <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground tabular-nums">第 {candidates.pagination.page} / {Math.max(candidates.pagination.totalPages, 1)} 页，共 {candidates.pagination.total} 张</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={candidateLoading || candidates.pagination.page <= 1} onClick={() => project && void loadCandidates(project, candidates.pagination.page - 1)}><ChevronLeft data-icon="inline-start" />上一页</Button><Button type="button" size="sm" variant="outline" disabled={candidateLoading || candidates.pagination.page >= candidates.pagination.totalPages} onClick={() => project && void loadCandidates(project, candidates.pagination.page + 1)}>下一页<ChevronRight data-icon="inline-end" /></Button></div></div> : null}
          <div id="publication-images-error"><FieldError>{hasImageError ? "还需选择至少 3 张项目图片才能发布" : null}</FieldError></div>
        </FieldSet>
        {takingOffline ? <StatusAlert tone="warning" title="保存后将下线">该项目会从抖音小程序移除；再次选择“已发布”并满足门禁后可重新上线。</StatusAlert> : null}
        {mutationError ? <StatusAlert>{mutationError}</StatusAlert> : null}
        {warnings.length ? <p className="text-sm text-destructive" role="status">暂不能保存：{warnings.join("；")}</p> : null}
      </div>
      <DialogFooter className="shrink-0 border-t bg-background p-5"><Button variant="outline" disabled={saving} onClick={() => handleOpenChange(false)}>取消</Button><Button disabled={saving || warnings.length > 0} onClick={() => void save()}>{saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}{publicationSubmitLabel(project?.public_profile?.publication_status, draft.publication_status)}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function CandidateImageOption({ item, accessibleName, checked, disabled, onCheckedChange }: { item: CandidateImage; accessibleName: string; checked: boolean; disabled: boolean; onCheckedChange(checked: boolean): void }) {
  const [failed, setFailed] = useState(false);
  const preview = failed ? null : safeHttpsPreview(item.preview_url);
  return <label className="flex cursor-pointer flex-col gap-2 rounded-md border p-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50" data-disabled={disabled}>
    <span className="relative aspect-[4/3] overflow-hidden rounded-sm bg-muted">{preview ? <Image alt={accessibleName} fill unoptimized sizes="(min-width: 768px) 180px, 45vw" className="object-cover" src={preview} onError={() => setFailed(true)} /> : <span className="flex h-full items-center justify-center text-muted-foreground"><ImageOff aria-hidden="true" /><span className="sr-only">{accessibleName}预览不可用</span></span>}</span>
    <span className="flex items-center gap-2 text-xs"><Checkbox aria-label={`选择${accessibleName}`} checked={checked} disabled={disabled} onCheckedChange={(value) => onCheckedChange(value === true)} /><span>{checked ? "已选择" : "选择图片"}</span></span>
  </label>;
}

function SelectedImageOption({ item, disabled, onRemove }: { item: CandidateImage & { label: string }; disabled: boolean; onRemove(): void }) {
  const [failed, setFailed] = useState(false);
  const preview = failed ? null : safeHttpsPreview(item.preview_url);
  return <div className="flex flex-col gap-2 rounded-md border p-2">
    <span className="relative aspect-[4/3] overflow-hidden rounded-sm bg-muted">{preview ? <Image alt={item.label} fill unoptimized sizes="(min-width: 768px) 180px, 45vw" className="object-cover" src={preview} onError={() => setFailed(true)} /> : <span className="flex h-full items-center justify-center text-muted-foreground"><ImageOff aria-hidden="true" /><span className="sr-only">{item.label}预览不可用</span></span>}</span>
    <Button type="button" size="sm" variant="ghost" disabled={disabled} aria-label={`移除${item.label}`} onClick={onRemove}>移除</Button>
  </div>;
}

function ProjectTableSkeleton() {
  return <div className="flex flex-col gap-3 p-5" aria-busy="true" aria-label="项目实景内容加载中">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-16 w-full" key={index} />)}</div>;
}

function parseTags(value: string): string[] { return Array.from(new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))); }
function publicationLabel(status?: PublicationStatus): string { return status === "published" ? "已发布" : status === "hidden" ? "已隐藏" : "草稿"; }
function publicationVariant(status?: PublicationStatus): "success" | "secondary" | "warning" { return status === "published" ? "success" : status === "hidden" ? "secondary" : "warning"; }

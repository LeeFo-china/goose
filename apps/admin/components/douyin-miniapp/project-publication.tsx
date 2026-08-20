"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
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
  emptyCandidatePage,
  emptyPublicationDraft,
  getPublicationReadinessWarnings,
  getPublicationRefreshPage,
  getPublicationWarnings,
  normalizeCandidatePage,
  normalizeProjectPage,
  normalizeSavedProjectProfile,
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

  async function loadPage(
    page: number,
    nextStatus = status,
    statusChanged = false,
  ) {
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
        },
      );
      const next = normalizeProjectPage(raw, { page, pageSize: PAGE_SIZE });
      if (!next) throw new Error("项目列表分页数据无效，请刷新后重试");
      setData(next);
      window.history.replaceState(null, "", buildProjectPublicationHref({
        page,
        publicationStatus: nextStatus,
        statusChanged,
      }));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "项目实景内容加载失败",
      );
    } finally {
      setLoading(false);
    }
  }

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

      {error ? <StatusAlert>{error}</StatusAlert> : null}
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
            {loading && data.list.length === 0 ? <ProjectTableSkeleton /> : (
              <ProjectTable rows={data.list} onEdit={setEditing} />
            )}
          </div>
          {loading && data.list.length > 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/65 pt-8 backdrop-blur-[1px]">
              <span className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新列表
              </span>
            </div>
          ) : null}
          <footer className="flex shrink-0 flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
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
                onClick={() => void loadPage(data.pagination.page - 1)}
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
                onClick={() => void loadPage(data.pagination.page + 1)}
              >
                下一页
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
          </footer>
        </CardContent>
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
            void loadPage(refreshPage);
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
          projectProfileDraft(row),
        );
        const phase = projectPhaseDisplay(row.status);
        return <TableRow key={row.id}>
          <TableCell><div className="min-w-[220px]"><p className="font-medium">{row.name?.trim() || "未命名项目"}</p><p className="mt-1 text-xs text-muted-foreground">{row.property?.community || "未填写小区"}{row.property?.layout ? ` · ${row.property.layout}` : ""}</p></div></TableCell>
          <TableCell><Badge variant={phase.variant}>{phase.label}</Badge></TableCell>
          <TableCell><Badge variant={publicationVariant(row.public_profile?.publication_status)}>{publicationLabel(row.public_profile?.publication_status)}</Badge></TableCell>
          <TableCell className="tabular-nums">已选图片 {row.public_profile?.public_image_urls.length ?? 0} 张</TableCell>
          <TableCell>{warnings.length ? <span className="text-sm text-destructive">{warnings.join("；")}</span> : <span className="text-sm text-success">内容完整</span>}</TableCell>
          <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => onEdit(row)}><Pencil data-icon="inline-start" />编辑公开资料</Button></TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
  );
}

function PublicationDialog({ project, onOpenChange, onSaved }: { project: ProjectPublicationRow | null; onOpenChange(open: boolean): void; onSaved(profile: ProjectProfile): void }) {
  const [draft, setDraft] = useState<ProjectPublicationDraft>(() => emptyPublicationDraft());
  const [candidates, setCandidates] = useState<CandidatePage>(emptyCandidatePage());
  const [styleTagsInput, setStyleTagsInput] = useState("");
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCandidates(activeProject: ProjectPublicationRow, page: number) {
    setCandidateLoading(true);
    setError(null);
    try {
      const raw = await requestBackendJson<unknown>(`/tenant/douyin-miniapp/projects/${activeProject.id}/images?page=${page}&pageSize=${PAGE_SIZE}`, { cache: "no-store", fallbackMessage: "项目图片加载失败" });
      const next = normalizeCandidatePage(raw, { page, pageSize: PAGE_SIZE });
      if (!next) throw new Error("项目图片分页数据无效，请关闭后重试");
      setCandidates(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "项目图片加载失败");
    } finally {
      setCandidateLoading(false);
    }
  }

  useEffect(() => {
    if (!project) return;
    const nextDraft = projectProfileDraft(project);
    setDraft(nextDraft);
    setStyleTagsInput(nextDraft.style_tags.join("，"));
    setCandidates(emptyCandidatePage());
    setError(null);
    void loadCandidates(project, 1);
  }, [project]);

  function handleOpenChange(open: boolean) {
    if (!open) {
      if (!saving) onOpenChange(false);
    }
  }

  const warnings = getPublicationWarnings(draft);
  const hasStyleTagError = draft.style_tags.some(
    (tag) => tag.trim().length > 40,
  );
  const hasTooManyStyleTags = draft.style_tags.length > 8;
  async function save() {
    if (!project || warnings.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      const response = await requestBackendJson<unknown>(`/tenant/douyin-miniapp/projects/${project.id}/publication`, {
        method: "PATCH",
        body: JSON.stringify(draft),
        fallbackMessage: "公开资料保存失败",
      });
      const profile = normalizeSavedProjectProfile(response);
      if (!profile) throw new Error("公开资料保存结果无效，请刷新后确认");
      onSaved(profile);
      toast.success(draft.publication_status === "published" ? "项目实景已发布" : "项目公开资料已保存");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "公开资料保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(project)} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[860px] overflow-hidden p-0">
        <DialogHeader className="border-b p-5"><DialogTitle>编辑项目公开资料</DialogTitle><DialogDescription>{project?.name || "未命名项目"}，只可选择当前项目已有图片，保存时保留原始图片引用。</DialogDescription></DialogHeader>
        <div className="flex max-h-[calc(90vh-82px)] flex-col gap-4 overflow-y-auto p-5">
          <FieldGroup>
            <Field data-invalid={draft.public_title.trim().length < 2 || undefined}><FieldLabel htmlFor="publication-title">公开标题</FieldLabel><Input id="publication-title" maxLength={100} disabled={saving} aria-invalid={draft.public_title.trim().length < 2} value={draft.public_title} onChange={(event) => setDraft({ ...draft, public_title: event.target.value })} /><FieldError>{draft.public_title.trim().length < 2 ? "至少输入 2 个字符" : null}</FieldError></Field>
            <Field data-invalid={draft.public_description.trim().length < 20 || undefined}><FieldLabel htmlFor="publication-description">公开说明</FieldLabel><Textarea id="publication-description" maxLength={2000} disabled={saving} aria-invalid={draft.public_description.trim().length < 20} value={draft.public_description} onChange={(event) => setDraft({ ...draft, public_description: event.target.value })} /><FieldDescription>{draft.public_description.trim().length}/2000 字符，至少 20 个字符。</FieldDescription><FieldError>{draft.public_description.trim().length < 20 ? "至少输入 20 个字符" : null}</FieldError></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={hasStyleTagError || hasTooManyStyleTags || undefined}><FieldLabel htmlFor="publication-tags">风格标签</FieldLabel><Input id="publication-tags" aria-invalid={hasStyleTagError || hasTooManyStyleTags} disabled={saving} placeholder="现代，简约，原木" value={styleTagsInput} onChange={(event) => { setStyleTagsInput(event.target.value); setDraft({ ...draft, style_tags: parseTags(event.target.value) }); }} /><FieldDescription>使用逗号分隔，最多 8 个标签，每个不超过 40 个字符。</FieldDescription><FieldError>{hasTooManyStyleTags ? "风格标签最多选择 8 个" : hasStyleTagError ? "每个风格标签最多 40 个字符" : null}</FieldError></Field>
              <Field><FieldLabel htmlFor="publication-budget">预算区间</FieldLabel><Input id="publication-budget" maxLength={80} disabled={saving} placeholder="例如 20-30 万" value={draft.budget_band ?? ""} onChange={(event) => setDraft({ ...draft, budget_band: event.target.value || null })} /></Field>
            </div>
            <Field><FieldLabel htmlFor="publication-status">发布状态</FieldLabel><FormSelect id="publication-status" disabled={saving} value={draft.publication_status} options={[{ value: "draft", label: "草稿" }, { value: "published", label: "已发布" }, { value: "hidden", label: "已隐藏" }]} onChange={(value) => setDraft({ ...draft, publication_status: value as PublicationStatus })} /></Field>
          </FieldGroup>

          <FieldSet data-invalid={draft.publication_status === "published" && draft.public_image_urls.length < 3 || undefined}>
            <FieldLegend className="mb-0 text-sm">项目图片</FieldLegend>
            <div className="flex flex-wrap items-center justify-between gap-2"><FieldDescription>已选图片 {draft.public_image_urls.length} / {MAX_IMAGES} 张，翻页不会清空已选项。</FieldDescription><Badge variant={draft.public_image_urls.length >= 3 ? "success" : "warning"}>发布至少 3 张</Badge></div>
            {candidateLoading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="aspect-[4/3] w-full" />)}</div> : candidates.items.length ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{candidates.items.map((item, index) => <CandidateImageOption key={item.reference} item={item} accessibleName={candidateImageAccessibleLabel({ page: candidates.pagination.page, pageSize: candidates.pagination.pageSize, index })} checked={draft.public_image_urls.includes(item.reference)} disabled={saving || (!draft.public_image_urls.includes(item.reference) && draft.public_image_urls.length >= MAX_IMAGES)} onCheckedChange={(checked) => setDraft({ ...draft, public_image_urls: updateImageSelection(draft.public_image_urls, item.reference, checked) })} />)}</div>
            ) : <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><ImageOff /></EmptyMedia><EmptyTitle>暂无可选图片</EmptyTitle><EmptyDescription>请先在该项目的施工日志中上传实景图片。</EmptyDescription></EmptyHeader></Empty>}
            <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground tabular-nums">第 {candidates.pagination.page} / {Math.max(candidates.pagination.totalPages, 1)} 页，共 {candidates.pagination.total} 张</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={candidateLoading || candidates.pagination.page <= 1} onClick={() => project && void loadCandidates(project, candidates.pagination.page - 1)}><ChevronLeft data-icon="inline-start" />上一页</Button><Button size="sm" variant="outline" disabled={candidateLoading || candidates.pagination.page >= candidates.pagination.totalPages} onClick={() => project && void loadCandidates(project, candidates.pagination.page + 1)}>下一页<ChevronRight data-icon="inline-end" /></Button></div></div>
            <FieldError>{draft.publication_status === "published" && draft.public_image_urls.length < 3 ? "还需选择至少 3 张项目图片才能发布" : null}</FieldError>
          </FieldSet>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          {warnings.length ? <p className="text-sm text-destructive" role="status">暂不能保存：{warnings.join("；")}</p> : null}
          <DialogFooter><Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>取消</Button><Button disabled={saving || warnings.length > 0} onClick={() => void save()}>{saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}{draft.publication_status === "published" ? "发布项目实景" : "保存公开资料"}</Button></DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidateImageOption({ item, accessibleName, checked, disabled, onCheckedChange }: { item: CandidateImage; accessibleName: string; checked: boolean; disabled: boolean; onCheckedChange(checked: boolean): void }) {
  const [failed, setFailed] = useState(false);
  const preview = failed ? null : safeHttpsPreview(item.preview_url);
  return <label className="flex cursor-pointer flex-col gap-2 rounded-md border p-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50" data-disabled={disabled}>
    <span className="relative aspect-[4/3] overflow-hidden rounded-sm bg-muted">{preview ? <Image alt={accessibleName} fill unoptimized sizes="(min-width: 768px) 180px, 45vw" className="object-cover" src={preview} onError={() => setFailed(true)} /> : <span className="flex h-full items-center justify-center text-muted-foreground"><ImageOff aria-hidden="true" /><span className="sr-only">{accessibleName}预览不可用</span></span>}</span>
    <span className="flex items-center gap-2 text-xs"><Checkbox aria-label={`选择${accessibleName}`} checked={checked} disabled={disabled} onCheckedChange={(value) => onCheckedChange(value === true)} /><span>{checked ? "已选择" : "选择图片"}</span></span>
  </label>;
}

function ProjectTableSkeleton() {
  return <div className="flex flex-col gap-3 p-5" aria-busy="true" aria-label="项目实景内容加载中">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-16 w-full" key={index} />)}</div>;
}

function parseTags(value: string): string[] { return Array.from(new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))); }
function publicationLabel(status?: PublicationStatus): string { return status === "published" ? "已发布" : status === "hidden" ? "已隐藏" : "草稿"; }
function publicationVariant(status?: PublicationStatus): "success" | "secondary" | "warning" { return status === "published" ? "success" : status === "hidden" ? "secondary" : "warning"; }

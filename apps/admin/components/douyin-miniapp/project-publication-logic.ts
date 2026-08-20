import {
  isProjectStatus,
  ProjectStatusConfig,
} from "@gooes/domain";

export const PROJECT_PUBLICATION_PAGE_SIZE = 20;
export const PROJECT_PUBLICATION_MAX_IMAGES = 30;
export const PROJECT_PUBLICATION_STATUSES = [
  "draft",
  "published",
  "hidden",
] as const;

export type PublicationStatus = typeof PROJECT_PUBLICATION_STATUSES[number];
export type ProjectPublicationDraft = {
  public_title: string;
  public_description: string;
  public_image_urls: string[];
  style_tags: string[];
  budget_band: string | null;
  publication_status: PublicationStatus;
};
export type ProjectProfile = ProjectPublicationDraft & { updated_at: string };
export type ProjectPublicationRow = {
  id: string;
  name: string | null;
  status: string | null;
  updated_at: string;
  property: {
    community: string;
    layout: string | null;
    area: number | string | null;
  } | null;
  public_profile: ProjectProfile | null;
};
export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type ProjectPublicationPage = {
  list: ProjectPublicationRow[];
  pagination: Pagination;
};
export type CandidateImage = { reference: string; preview_url: string | null };
export type CandidatePage = { items: CandidateImage[]; pagination: Pagination };
export type RequestTicket = { id: number; controller: AbortController };
export type ListRequestTarget = { page: number; publicationStatus: string };
export type SelectedImageItem = CandidateImage & { label: string };
type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "danger";

export function getPublicationWarnings(draft: ProjectPublicationDraft): string[] {
  const warnings: string[] = [];
  if (draft.public_title.trim().length < 2) {
    warnings.push("公开标题至少需要 2 个字符");
  } else if (draft.public_title.trim().length > 100) {
    warnings.push("公开标题最多 100 个字符");
  }
  if (draft.public_description.trim().length < 20) {
    warnings.push("公开说明至少需要 20 个字符");
  } else if (draft.public_description.trim().length > 2000) {
    warnings.push("公开说明最多 2000 个字符");
  }
  if (draft.style_tags.some((tag) => tag.trim().length === 0)) {
    warnings.push("风格标签不能为空");
  } else if (draft.style_tags.some((tag) => tag.trim().length > 40)) {
    warnings.push("每个风格标签最多 40 个字符");
  }
  if (draft.style_tags.length > 8) {
    warnings.push("风格标签最多选择 8 个");
  }
  if (draft.budget_band !== null && !draft.budget_band.trim()) {
    warnings.push("预算区间填写后不能为空");
  } else if ((draft.budget_band?.trim().length ?? 0) > 80) {
    warnings.push("预算区间最多 80 个字符");
  }
  if (draft.public_image_urls.length > PROJECT_PUBLICATION_MAX_IMAGES) {
    warnings.push("项目图片最多选择 30 张");
  }
  if (
    draft.publication_status === "published"
    && draft.public_image_urls.length < 3
  ) {
    warnings.push("发布项目至少需要选择 3 张图片");
  }
  return warnings;
}

export function getPublicationReadinessWarnings(
  row: ProjectPublicationRow,
  draft: ProjectPublicationDraft,
): string[] {
  const warnings = getPublicationWarnings({
    ...draft,
    publication_status: "published",
  });
  if (!(["started", "constructing", "acceptance"] as const).includes(
    row.status as "started" | "constructing" | "acceptance",
  )) warnings.push("当前项目阶段暂不支持公开");
  if (!row.property?.layout?.trim()) warnings.push("请完善项目户型");
  const area = row.property?.area;
  if (
    area === null
    || area === undefined
    || (typeof area === "string" && !area.trim())
  ) warnings.push("请完善项目面积");
  if (!draft.style_tags.some((tag) => tag.trim())) {
    warnings.push("发布前至少填写 1 个风格标签");
  }
  if (draft.budget_band === null) warnings.push("发布前请填写预算区间");
  return warnings;
}

export function getPublicationSaveWarnings(
  row: ProjectPublicationRow,
  draft: ProjectPublicationDraft,
): string[] {
  return draft.publication_status === "published"
    ? getPublicationReadinessWarnings(row, draft)
    : getPublicationWarnings(draft);
}

export function projectPhaseDisplay(
  status: string | null,
): { label: string; variant: BadgeVariant } {
  if (status === "final_acceptance_completed") {
    return { label: "已完成", variant: "success" };
  }
  if (!status) return { label: "未设置", variant: "outline" };
  if (!isProjectStatus(status)) {
    return { label: "未知阶段", variant: "outline" };
  }
  const config = ProjectStatusConfig[status];
  return {
    label: config.label,
    variant: config.type === "primary"
      ? "default"
      : config.type === "default"
        ? "secondary"
        : config.type,
  };
}

export function updateImageSelection(
  selected: readonly string[],
  reference: string,
  checked: boolean,
): string[] {
  if (!checked) return selected.filter((item) => item !== reference);
  if (
    selected.includes(reference)
    || selected.length >= PROJECT_PUBLICATION_MAX_IMAGES
  ) return [...selected];
  return [...selected, reference];
}

export function clearImageSelection(): string[] {
  return [];
}

export function getSelectedImageItems(
  selected: readonly string[],
  candidates: readonly CandidateImage[],
): SelectedImageItem[] {
  const previewByReference = new Map(
    candidates.map((item) => [item.reference, item.preview_url]),
  );
  return selected.map((reference, index) => ({
    reference,
    label: `第 ${index + 1} 张已选图片`,
    preview_url: previewByReference.get(reference) ?? null,
  }));
}

export function createRequestAuthority() {
  let sequence = 0;
  let current: RequestTicket | null = null;
  return {
    begin(): RequestTicket {
      current?.controller.abort();
      current = { id: sequence + 1, controller: new AbortController() };
      sequence = current.id;
      return current;
    },
    isCurrent(ticket: RequestTicket): boolean {
      return current?.id === ticket.id && !ticket.controller.signal.aborted;
    },
    invalidate(): void {
      current?.controller.abort();
      current = null;
      sequence += 1;
    },
  };
}

export function createLatestListRequestTarget(initial: ListRequestTarget) {
  let target = { ...initial };
  return {
    update(next: ListRequestTarget): void {
      target = { ...next };
    },
    current(): ListRequestTarget {
      return { ...target };
    },
  };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function getCollectionViewState(input: {
  loading: boolean;
  error: string | null;
  itemCount: number;
}): "error" | "loading" | "empty" | "ready" {
  if (input.error) return "error";
  if (input.loading && input.itemCount === 0) return "loading";
  return input.itemCount === 0 ? "empty" : "ready";
}

export function publicationSubmitLabel(
  originalStatus: PublicationStatus | undefined,
  nextStatus: PublicationStatus,
): string {
  if (originalStatus === "published" && nextStatus === "draft") {
    return "保存为草稿并下线";
  }
  if (originalStatus === "published" && nextStatus === "hidden") {
    return "隐藏并下线";
  }
  return nextStatus === "published" ? "发布项目实景" : "保存公开资料";
}

export function safeHttpsPreview(value: string | null): string | null {
  if (!value || /\s/.test(value)) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export function candidateImageAccessibleLabel(input: {
  page: number;
  pageSize: number;
  index: number;
}): string {
  return `第 ${(input.page - 1) * input.pageSize + input.index + 1} 张项目图片`;
}

export function buildProjectPublicationHref(input: {
  page: number;
  publicationStatus?: string;
  statusChanged?: boolean;
}): string {
  const query = new URLSearchParams();
  if (!input.statusChanged && input.page > 1) {
    query.set("page", String(input.page));
  }
  if (input.publicationStatus) {
    query.set("publicationStatus", input.publicationStatus);
  }
  const value = query.toString();
  return value
    ? `/douyin-miniapp/projects?${value}`
    : "/douyin-miniapp/projects";
}

export function getPublicationRefreshPage(input: {
  activeStatus: string;
  currentPage: number;
  currentPageRowCount: number;
  savedStatus: PublicationStatus;
}): number | null {
  if (!input.activeStatus || input.activeStatus === input.savedStatus) {
    return null;
  }
  return input.currentPageRowCount <= 1 && input.currentPage > 1
    ? input.currentPage - 1
    : input.currentPage;
}

export function normalizeProjectPage(
  value: unknown,
  expected: { page: number; pageSize: number },
): ProjectPublicationPage | null {
  if (!isRecord(value) || !Array.isArray(value.list)) return null;
  const pagination = normalizePagination(value.pagination, expected);
  if (!pagination || !value.list.every(isProjectRow)) return null;
  return { list: value.list, pagination };
}

export function normalizeCandidatePage(
  value: unknown,
  expected: { page: number; pageSize: number },
): CandidatePage | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const pagination = normalizePagination(value.pagination, expected);
  if (
    !pagination
    || !value.items.every((item) =>
      isRecord(item)
      && typeof item.reference === "string"
      && (item.preview_url === null || typeof item.preview_url === "string")
    )
  ) return null;
  return { items: value.items as CandidateImage[], pagination };
}

export function normalizeSavedProjectProfile(
  value: unknown,
): ProjectProfile | null {
  if (!isProjectProfile(value)) return null;
  return {
    public_title: value.public_title,
    public_description: value.public_description,
    public_image_urls: [...value.public_image_urls],
    style_tags: [...value.style_tags],
    budget_band: value.budget_band,
    publication_status: value.publication_status,
    updated_at: value.updated_at,
  };
}

export function emptyPublicationDraft(): ProjectPublicationDraft {
  return {
    public_title: "",
    public_description: "",
    public_image_urls: [],
    style_tags: [],
    budget_band: null,
    publication_status: "draft",
  };
}

export function projectProfileDraft(
  row: ProjectPublicationRow,
): ProjectPublicationDraft {
  if (!row.public_profile) {
    return emptyPublicationDraft();
  }
  return {
    public_title: row.public_profile.public_title,
    public_description: row.public_profile.public_description,
    public_image_urls: [...row.public_profile.public_image_urls],
    style_tags: [...row.public_profile.style_tags],
    budget_band: row.public_profile.budget_band,
    publication_status: row.public_profile.publication_status,
  };
}

export function emptyCandidatePage(): CandidatePage {
  return {
    items: [],
    pagination: {
      page: 1,
      pageSize: PROJECT_PUBLICATION_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isProjectRow(value: unknown): value is ProjectPublicationRow {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || typeof value.updated_at !== "string"
    || !(typeof value.name === "string" || value.name === null)
    || !(typeof value.status === "string" || value.status === null)
  ) return false;
  if (
    value.property !== null
    && (
      !isRecord(value.property)
      || typeof value.property.community !== "string"
      || !(
        typeof value.property.layout === "string"
        || value.property.layout === null
      )
      || !(
        typeof value.property.area === "number"
        || typeof value.property.area === "string"
        || value.property.area === null
      )
    )
  ) return false;
  return value.public_profile === null || isProjectProfile(value.public_profile);
}

function isProjectProfile(value: unknown): value is ProjectProfile {
  return isRecord(value)
    && typeof value.public_title === "string"
    && typeof value.public_description === "string"
    && Array.isArray(value.public_image_urls)
    && value.public_image_urls.every((item) => typeof item === "string")
    && Array.isArray(value.style_tags)
    && value.style_tags.every((item) => typeof item === "string")
    && (value.budget_band === null || typeof value.budget_band === "string")
    && PROJECT_PUBLICATION_STATUSES.includes(
      value.publication_status as PublicationStatus,
    )
    && typeof value.updated_at === "string";
}

function normalizePagination(
  value: unknown,
  expected: { page: number; pageSize: number },
): Pagination | null {
  if (
    !isRecord(value)
    || value.page !== expected.page
    || value.pageSize !== expected.pageSize
    || !Number.isInteger(value.total)
    || !Number.isInteger(value.totalPages)
    || (value.total as number) < 0
    || (value.totalPages as number) < 0
  ) return null;
  return value as Pagination;
}

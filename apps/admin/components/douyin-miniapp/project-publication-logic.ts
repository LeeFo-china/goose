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

export function getPublicationWarnings(draft: ProjectPublicationDraft): string[] {
  const warnings: string[] = [];
  if (draft.public_title.trim().length < 2) {
    warnings.push("公开标题至少需要 2 个字符");
  }
  if (draft.public_description.trim().length < 20) {
    warnings.push("公开说明至少需要 20 个字符");
  }
  if (draft.style_tags.some((tag) => tag.trim().length > 40)) {
    warnings.push("每个风格标签最多 40 个字符");
  }
  if (draft.style_tags.length > 8) {
    warnings.push("风格标签最多选择 8 个");
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
  draft: ProjectPublicationDraft,
): string[] {
  return getPublicationWarnings({
    ...draft,
    publication_status: "published",
  });
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

export function safeHttpsPreview(value: string | null): string | null {
  if (!value || /\s/.test(value)) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
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
    return {
      ...emptyPublicationDraft(),
      public_title: row.name?.trim() || "",
    };
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

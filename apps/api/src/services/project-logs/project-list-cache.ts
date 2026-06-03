type ProjectLogProjectListCacheInput = {
  tenantId: string;
  projectId: string;
  page: number;
  pageSize: number;
};

type ProjectLogProjectListResult = {
  rows: Array<Record<string, unknown>>;
  total: number;
};

const PROJECT_LOG_PROJECT_LIST_CACHE_TTL_MS = 10_000;
const MAX_PROJECT_LOG_PROJECT_LIST_CACHE_SIZE = 2_000;

export class ProjectLogProjectListCache {
  private cache = new Map<string, {
    expiresAt: number;
    value: ProjectLogProjectListResult;
  }>();
  private inFlight = new Map<string, Promise<ProjectLogProjectListResult>>();

  getOrLoad(
    input: ProjectLogProjectListCacheInput,
    loader: () => Promise<ProjectLogProjectListResult>,
  ) {
    const cacheKey = this.cacheKey(input);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.value);
    }
    if (cached) {
      this.cache.delete(cacheKey);
    }

    const inFlight = this.inFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = loader()
      .then((result) => {
        this.set(cacheKey, result);
        return result;
      })
      .finally(() => {
        if (this.inFlight.get(cacheKey) === request) {
          this.inFlight.delete(cacheKey);
        }
      });
    this.inFlight.set(cacheKey, request);
    return request;
  }

  invalidateProject(input: Pick<ProjectLogProjectListCacheInput, "tenantId" | "projectId">) {
    const prefix = this.projectPrefix(input);
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  updateAfterCreate(input: Pick<
    ProjectLogProjectListCacheInput,
    "tenantId" | "projectId"
  > & {
    row: Record<string, unknown>;
  }) {
    const prefix = this.projectPrefix(input);
    for (const [key, cached] of this.cache.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      if (cached.expiresAt <= Date.now()) {
        this.cache.delete(key);
        continue;
      }

      const pageInfo = this.parsePageKey(key);
      if (!pageInfo || pageInfo.page !== 1) {
        this.cache.delete(key);
        continue;
      }

      this.set(key, {
        rows: [input.row, ...cached.value.rows].slice(0, pageInfo.pageSize),
        total: cached.value.total + 1,
      });
    }
  }

  private set(cacheKey: string, value: ProjectLogProjectListResult) {
    const now = Date.now();
    if (this.cache.size >= MAX_PROJECT_LOG_PROJECT_LIST_CACHE_SIZE) {
      for (const [key, item] of this.cache.entries()) {
        if (item.expiresAt <= now) {
          this.cache.delete(key);
        }
      }

      if (this.cache.size >= MAX_PROJECT_LOG_PROJECT_LIST_CACHE_SIZE) {
        this.cache.clear();
      }
    }

    this.cache.set(cacheKey, {
      expiresAt: now + PROJECT_LOG_PROJECT_LIST_CACHE_TTL_MS,
      value,
    });
  }

  private cacheKey(input: ProjectLogProjectListCacheInput) {
    return `${this.projectPrefix(input)}${input.page}:${input.pageSize}`;
  }

  private projectPrefix(input: Pick<
    ProjectLogProjectListCacheInput,
    "tenantId" | "projectId"
  >) {
    return `${input.tenantId}:${input.projectId}:`;
  }

  private parsePageKey(cacheKey: string) {
    const parts = cacheKey.split(":");
    const page = Number(parts[2]);
    const pageSize = Number(parts[3]);
    if (!Number.isInteger(page) || !Number.isInteger(pageSize)) {
      return null;
    }

    return { page, pageSize };
  }
}

import type { ProjectLogCalendarRow } from "@/repositories/project-logs";

const PROJECT_LOG_CALENDAR_CACHE_TTL_MS = 10_000;
const MAX_PROJECT_LOG_CALENDAR_CACHE_SIZE = 2_000;

type ProjectLogCalendarCacheKeyInput = {
  tenantId: string;
  projectId: string;
};

function toAsiaShanghaiDateKey(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export class ProjectLogCalendarCache {
  private cache = new Map<string, {
    expiresAt: number;
    value: ProjectLogCalendarRow[];
  }>();
  private inFlight = new Map<string, Promise<ProjectLogCalendarRow[]>>();

  getOrLoad(
    input: ProjectLogCalendarCacheKeyInput,
    loader: () => Promise<ProjectLogCalendarRow[]>,
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
      .then((rows) => {
        this.set(cacheKey, rows);
        return rows;
      })
      .finally(() => {
        if (this.inFlight.get(cacheKey) === request) {
          this.inFlight.delete(cacheKey);
        }
      });
    this.inFlight.set(cacheKey, request);
    return request;
  }

  invalidate(input: ProjectLogCalendarCacheKeyInput) {
    this.cache.delete(this.cacheKey(input));
  }

  updateAfterCreate(input: ProjectLogCalendarCacheKeyInput & {
    row: Record<string, unknown>;
  }) {
    const cacheKey = this.cacheKey(input);
    const cached = this.cache.get(cacheKey);
    if (!cached || cached.expiresAt <= Date.now()) {
      this.cache.delete(cacheKey);
      return;
    }

    const date = toAsiaShanghaiDateKey(input.row.created_at);
    if (!date) {
      this.cache.delete(cacheKey);
      return;
    }

    const rows = [...cached.value];
    const existingIndex = rows.findIndex((item) => item.date === date);
    const nextRow: ProjectLogCalendarRow = {
      date,
      count: 1,
      stage_code: typeof input.row.stage_code === "string"
        ? input.row.stage_code
        : null,
      node_name: typeof input.row.node_name === "string"
        ? input.row.node_name
        : null,
    };
    if (existingIndex >= 0) {
      const existing = rows[existingIndex];
      if (!existing) {
        this.cache.delete(cacheKey);
        return;
      }
      rows[existingIndex] = {
        ...nextRow,
        count: Number(existing.count) + 1,
      };
    } else {
      rows.push(nextRow);
      rows.sort((left, right) => left.date.localeCompare(right.date));
    }

    this.set(cacheKey, rows);
  }

  private set(cacheKey: string, value: ProjectLogCalendarRow[]) {
    const now = Date.now();
    if (this.cache.size >= MAX_PROJECT_LOG_CALENDAR_CACHE_SIZE) {
      for (const [key, item] of this.cache.entries()) {
        if (item.expiresAt <= now) {
          this.cache.delete(key);
        }
      }

      if (this.cache.size >= MAX_PROJECT_LOG_CALENDAR_CACHE_SIZE) {
        this.cache.clear();
      }
    }

    this.cache.set(cacheKey, {
      expiresAt: now + PROJECT_LOG_CALENDAR_CACHE_TTL_MS,
      value,
    });
  }

  private cacheKey(input: ProjectLogCalendarCacheKeyInput) {
    return `${input.tenantId}:${input.projectId}`;
  }
}

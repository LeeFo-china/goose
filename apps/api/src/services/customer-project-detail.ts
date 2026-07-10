import { Errors } from "@/errors/error-factory";
import {
  customerProjectDetailRepository,
  type CustomerProjectAccessRow,
} from "@/repositories/customer-project-detail";
import { ExpiringInFlightCache } from "@/utils/expiring-in-flight-cache";

const PROJECT_ACCESS_CACHE_TTL_MS = 10_000;
type CustomerProjectDetailRepository = Pick<
  typeof customerProjectDetailRepository,
  "findOwnedProject" | "findOwnedProjectAccess"
>;
type OwnedProject = NonNullable<
  Awaited<ReturnType<CustomerProjectDetailRepository["findOwnedProject"]>>
>;

export class CustomerProjectDetailService {
  private accessCache = new Map<string, {
    expiresAt: number;
    value: CustomerProjectAccessRow | null;
  }>();
  private readonly detailCache: ExpiringInFlightCache<string, OwnedProject>;
  private readonly repository: CustomerProjectDetailRepository;

  constructor(options: {
    repository?: CustomerProjectDetailRepository;
    detailCacheTtlMs?: number;
  } = {}) {
    this.repository = options.repository ?? customerProjectDetailRepository;
    this.detailCache = new ExpiringInFlightCache({
      ttlMs: options.detailCacheTtlMs ?? 5_000,
    });
  }

  private getAccessCacheKey(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
  }) {
    return [input.tenantId, input.customerId, input.projectId].join(":");
  }

  private setAccessCache(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
    value: CustomerProjectAccessRow | null;
  }) {
    this.accessCache.set(this.getAccessCacheKey(input), {
      expiresAt: Date.now() + PROJECT_ACCESS_CACHE_TTL_MS,
      value: input.value,
    });
  }

  async getOwnedProject(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
  }) {
    return this.detailCache.getOrCreate(
      this.getAccessCacheKey(input),
      async () => {
        const project = await this.repository.findOwnedProject(input);
        if (!project) throw Errors.notFound("项目不存在");
        this.setAccessCache({
          ...input,
          value: {
            id: project.id,
            tenant_id: project.tenant_id ?? null,
          },
        });
        return project;
      },
    );
  }

  async getOwnedProjectAccess(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
  }) {
    const cacheKey = this.getAccessCacheKey(input);
    const cached = this.accessCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (!cached.value) throw Errors.notFound("项目不存在");
      return cached.value;
    }
    if (cached) this.accessCache.delete(cacheKey);

    const project = await this.repository.findOwnedProjectAccess(input);
    this.setAccessCache({
      ...input,
      value: project,
    });
    if (!project) throw Errors.notFound("项目不存在");
    return project;
  }
}

export const customerProjectDetailService =
  new CustomerProjectDetailService();

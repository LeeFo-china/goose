import {
  assertCanCreateAcceptance,
  assertCanCreateProjectLog,
  assertProjectReadyForAcceptance,
} from "./legacy/assertions";
import {
  buildProjectConstructionStagesFromRows,
  listProjectConstructionStages,
  listProjectConstructionStagesForProject as listProjectConstructionStagesForProjectRaw,
} from "./legacy/lists";
import { Errors } from "@/errors/error-factory";
import { customerConstructionStagesRepository } from "@/repositories/customer-construction-stages";

const CUSTOMER_CONSTRUCTION_STAGES_CACHE_TTL_MS = 10_000;
const MAX_CUSTOMER_CONSTRUCTION_STAGES_CACHE_SIZE = 2_000;

class ConstructionStageStatusService {
  private customerConstructionStagesCache = new Map<string, {
    expiresAt: number;
    value: Awaited<ReturnType<typeof listProjectConstructionStagesForProjectRaw>>;
  }>();
  private customerConstructionStagesInFlight = new Map<
    string,
    Promise<Awaited<ReturnType<typeof listProjectConstructionStagesForProjectRaw>>>
  >();

  listProjectConstructionStages = listProjectConstructionStages;
  buildProjectConstructionStagesFromRows = buildProjectConstructionStagesFromRows;
  assertCanCreateProjectLog = assertCanCreateProjectLog;
  assertCanCreateAcceptance = assertCanCreateAcceptance;
  assertProjectReadyForAcceptance = assertProjectReadyForAcceptance;

  listProjectConstructionStagesForProject(
    input: Parameters<typeof listProjectConstructionStagesForProjectRaw>[0],
  ) {
    if (input.authContext) {
      return listProjectConstructionStagesForProjectRaw(input);
    }

    const cacheKey = [
      input.tenantId ?? "",
      input.projectId,
      input.canReadAcceptance ?? "",
      input.canCreateAcceptance ?? "",
    ].join(":");
    const cached = this.customerConstructionStagesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.value);
    }
    if (cached) {
      this.customerConstructionStagesCache.delete(cacheKey);
    }

    const inFlight = this.customerConstructionStagesInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = listProjectConstructionStagesForProjectRaw(input)
      .then((result) => {
        this.setCustomerConstructionStagesCache(cacheKey, result);
        return result;
      })
      .finally(() => {
        if (this.customerConstructionStagesInFlight.get(cacheKey) === request) {
          this.customerConstructionStagesInFlight.delete(cacheKey);
        }
      });
    this.customerConstructionStagesInFlight.set(cacheKey, request);
    return request;
  }

  listCustomerProjectConstructionStages(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
  }) {
    const cacheKey = [
      "customer_rpc",
      input.tenantId,
      input.customerId,
      input.projectId,
    ].join(":");
    const cached = this.customerConstructionStagesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
    if (cached) this.customerConstructionStagesCache.delete(cacheKey);

    const inFlight = this.customerConstructionStagesInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const request = customerConstructionStagesRepository.getBootstrap(input)
      .then(async (row) => {
        if (!row) throw Errors.notFound("项目不存在");
        const result = await buildProjectConstructionStagesFromRows({
          project: row.project,
          acceptanceRows: row.acceptance_rows,
          logRows: row.log_rows,
          latestLogRows: row.latest_log_rows,
        });
        this.setCustomerConstructionStagesCache(cacheKey, result);
        return result;
      })
      .finally(() => {
        if (this.customerConstructionStagesInFlight.get(cacheKey) === request) {
          this.customerConstructionStagesInFlight.delete(cacheKey);
        }
      });
    this.customerConstructionStagesInFlight.set(cacheKey, request);
    return request;
  }

  private setCustomerConstructionStagesCache(
    cacheKey: string,
    value: Awaited<ReturnType<typeof listProjectConstructionStagesForProjectRaw>>,
  ) {
    const now = Date.now();
    if (
      this.customerConstructionStagesCache.size >=
        MAX_CUSTOMER_CONSTRUCTION_STAGES_CACHE_SIZE
    ) {
      for (const [key, item] of this.customerConstructionStagesCache.entries()) {
        if (item.expiresAt <= now) {
          this.customerConstructionStagesCache.delete(key);
        }
      }

      if (
        this.customerConstructionStagesCache.size >=
          MAX_CUSTOMER_CONSTRUCTION_STAGES_CACHE_SIZE
      ) {
        this.customerConstructionStagesCache.clear();
      }
    }

    this.customerConstructionStagesCache.set(cacheKey, {
      expiresAt: now + CUSTOMER_CONSTRUCTION_STAGES_CACHE_TTL_MS,
      value,
    });
  }
}

export const constructionStageStatusService =
  new ConstructionStageStatusService();

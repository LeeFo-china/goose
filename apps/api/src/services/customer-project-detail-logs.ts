import {
  customerProjectDetailLogsRepository,
  type CustomerProjectDetailLogRow,
} from "@/repositories/customer-project-detail-logs";

type CustomerProjectDetailLogsRepository = Pick<
  typeof customerProjectDetailLogsRepository,
  "listLogs"
>;

export class CustomerProjectDetailLogsService {
  private cache = new Map<string, { expiresAt: number; value: CustomerProjectDetailLogRow[] }>();

  constructor(
    private readonly repository: CustomerProjectDetailLogsRepository,
  ) {}

  async listLogs(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
    pageSize: number;
    signal?: AbortSignal;
  }) {
    const cacheKey = [
      input.tenantId,
      input.customerId,
      input.projectId,
      input.pageSize,
    ].join(":");
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.cache.delete(cacheKey);

    const value = await this.repository.listLogs(input);
    this.cache.set(cacheKey, { expiresAt: Date.now() + 10_000, value });
    return value;
  }
}

export const customerProjectDetailLogsService =
  new CustomerProjectDetailLogsService(customerProjectDetailLogsRepository);

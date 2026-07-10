import {
  createProjectWorkflowProgressTimingSteps,
  projectWorkflowProgressTimingStepKeys,
  type ProjectWorkflowProgressTimingSteps,
} from "@/services/project-workflow-progress-timing";
import { ExpiringInFlightCache } from "@/utils/expiring-in-flight-cache";

export class ProjectWorkflowProgressReadCache<Value> {
  private readonly cache: ExpiringInFlightCache<string, {
    value: Value;
    timing: ProjectWorkflowProgressTimingSteps;
  }>;

  constructor(ttlMs: number) {
    this.cache = new ExpiringInFlightCache({ ttlMs });
  }

  async getOrCreate(input: {
    key: string;
    timing?: ProjectWorkflowProgressTimingSteps;
    load: (timing: ProjectWorkflowProgressTimingSteps) => Promise<Value>;
    shouldCache: (value: Value) => boolean;
  }): Promise<Value> {
    const loadTiming = createProjectWorkflowProgressTimingSteps();
    const result = await this.cache.getOrCreateWithStatus(
      input.key,
      async () => ({ value: await input.load(loadTiming), timing: loadTiming }),
      { shouldCache: (cached) => input.shouldCache(cached.value) },
    );
    if (input.timing) {
      input.timing.cache_status = result.status;
      for (const step of projectWorkflowProgressTimingStepKeys) {
        input.timing[step] = result.status === "hit" ? 0 : result.value.timing[step];
      }
    }
    return result.value.value;
  }

  invalidate(key: string): void {
    this.cache.invalidate(key);
  }
}

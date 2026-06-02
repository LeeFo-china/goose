import { ApifyTranscriptGateway } from "./legacy/apify-gateway";
import {
  resolveTenantId,
  getTranscriptionProvider,
  getApifyConfig,
  getMediaProcessingConfig,
  assertEnabled,
  assertDailyLimit,
  findCached,
} from "./legacy/config";
import { createTask, getTask } from "./legacy/tasks";
import { processTask } from "./legacy/processor";
import { finalizeCompletedBilling } from "./legacy/billing";
import { testApify } from "./legacy/testing";

class SocialVideoTranscriptionService {
  private apifyGateway = new ApifyTranscriptGateway();

  private resolveTenantId = resolveTenantId;
  private getTranscriptionProvider = getTranscriptionProvider;
  private getApifyConfig = getApifyConfig;
  private getMediaProcessingConfig = getMediaProcessingConfig;
  private assertEnabled = assertEnabled;
  private assertDailyLimit = assertDailyLimit;
  private findCached = findCached;
  createTask = createTask;
  getTask = getTask;
  processTask = processTask;
  private finalizeCompletedBilling = finalizeCompletedBilling;
  testApify = testApify;
}

export const socialVideoTranscriptionService =
  new SocialVideoTranscriptionService();

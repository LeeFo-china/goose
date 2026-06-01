import {
  getTenantAccount,
  getTenantSummary,
  listTenantLedger,
  getTenantFeatureEstimates,
  getPlatformSummary,
  listPlatformTenants,
  manualRecharge,
  listPlatformLedger,
  listPlatformBillingEvents,
} from './legacy/tenant-platform';
import {
  getPlatformAiUsageStats,
  getPlatformAiUsageFilterOptions,
} from './legacy/ai-usage';
import {
  assertSmsChargeAvailable,
  recordSmsBilling,
  assertSocialVideoChargeAvailable,
  freezeSocialVideoTask,
  settleSocialVideoTask,
  releaseSocialVideoTaskFreeze,
  getSocialVideoMinChargeCredits,
  buildSmsBillingEventInput,
} from './legacy/runtime-charges';
import {
  emptyShadowSourceResult,
  runShadowBilling,
  shadowBillAi,
  shadowBillSms,
  shadowBillSocialVideo,
} from './legacy/shadow';
import {
  buildAiShadowEvents,
  estimateAiRowCredits,
  countMissingAiPricingRules,
  estimateMetricCredits,
  buildSmsShadowEvent,
  buildSocialVideoShadowEvent,
  buildEstimatedEvent,
  buildFailedEvent,
  resolvePricingRule,
  pricingRuleScore,
  snapshotPricingRule,
} from './legacy/shadow-events';
import {
  listPricingRules,
  createPricingRule,
  updatePricingRule,
  assertPricingRuleTenant,
  recordPricingAudit,
  assertPlatformAdmin,
} from './legacy/pricing';

class BillingService {
  getTenantAccount = getTenantAccount;
  getTenantSummary = getTenantSummary;
  listTenantLedger = listTenantLedger;
  getTenantFeatureEstimates = getTenantFeatureEstimates;
  getPlatformSummary = getPlatformSummary;
  listPlatformTenants = listPlatformTenants;
  manualRecharge = manualRecharge;
  listPlatformLedger = listPlatformLedger;
  listPlatformBillingEvents = listPlatformBillingEvents;
  getPlatformAiUsageStats = getPlatformAiUsageStats;
  getPlatformAiUsageFilterOptions = getPlatformAiUsageFilterOptions;
  assertSmsChargeAvailable = assertSmsChargeAvailable;
  recordSmsBilling = recordSmsBilling;
  assertSocialVideoChargeAvailable = assertSocialVideoChargeAvailable;
  freezeSocialVideoTask = freezeSocialVideoTask;
  settleSocialVideoTask = settleSocialVideoTask;
  releaseSocialVideoTaskFreeze = releaseSocialVideoTaskFreeze;
  private getSocialVideoMinChargeCredits = getSocialVideoMinChargeCredits;
  private buildSmsBillingEventInput = buildSmsBillingEventInput;
  private emptyShadowSourceResult = emptyShadowSourceResult;
  runShadowBilling = runShadowBilling;
  private shadowBillAi = shadowBillAi;
  private shadowBillSms = shadowBillSms;
  private shadowBillSocialVideo = shadowBillSocialVideo;
  private buildAiShadowEvents = buildAiShadowEvents;
  private estimateAiRowCredits = estimateAiRowCredits;
  private countMissingAiPricingRules = countMissingAiPricingRules;
  private estimateMetricCredits = estimateMetricCredits;
  private buildSmsShadowEvent = buildSmsShadowEvent;
  private buildSocialVideoShadowEvent = buildSocialVideoShadowEvent;
  private buildEstimatedEvent = buildEstimatedEvent;
  private buildFailedEvent = buildFailedEvent;
  private resolvePricingRule = resolvePricingRule;
  private pricingRuleScore = pricingRuleScore;
  private snapshotPricingRule = snapshotPricingRule;
  listPricingRules = listPricingRules;
  createPricingRule = createPricingRule;
  updatePricingRule = updatePricingRule;
  private assertPricingRuleTenant = assertPricingRuleTenant;
  private recordPricingAudit = recordPricingAudit;
  private assertPlatformAdmin = assertPlatformAdmin;
}

export const billingService = new BillingService();

import {
  assertPlatformSiteContentPermission,
  listPages,
  listPlatformPages,
  getNextActiveSortOrder,
  reorderActivePages,
  listPublishedEntries,
  listProjectOptions,
  reorderPage,
  reorderPlatformPage,
} from "./legacy/admin-list";
import {
  getPage,
  getPlatformPage,
  createPage,
  createPlatformPage,
  updatePage,
  updatePlatformPage,
  archivePage,
  archivePlatformPage,
  offlinePage,
  offlinePlatformPage,
  getExistingPage,
  assertSlugAvailable,
} from "./legacy/pages";
import {
  getDraft,
  getPlatformDraft,
  saveDraft,
  savePlatformDraft,
  publishPage,
  publishPlatformPage,
  duplicatePage,
  duplicatePlatformPage,
  getNextVersionNo,
  getOrCreateDraftVersion,
  generateCopySlug,
} from "./legacy/drafts";
import {
  getPublishedPageBySlug,
  createH5Session,
  resolveH5MarketingIdentity,
  isWithinDisplayWindow,
} from "./legacy/public-h5";
import {
  submitLead,
  trackEvent,
  listLeads,
  updateLead,
  convertLeadToCustomer,
} from "./legacy/leads-events";

class MarketingPageService {
  private assertPlatformSiteContentPermission = assertPlatformSiteContentPermission;
  listPages = listPages;
  listPlatformPages = listPlatformPages;
  private getNextActiveSortOrder = getNextActiveSortOrder;
  private reorderActivePages = reorderActivePages;
  listPublishedEntries = listPublishedEntries;
  listProjectOptions = listProjectOptions;
  reorderPage = reorderPage;
  reorderPlatformPage = reorderPlatformPage;
  getPage = getPage;
  getPlatformPage = getPlatformPage;
  createPage = createPage;
  createPlatformPage = createPlatformPage;
  updatePage = updatePage;
  updatePlatformPage = updatePlatformPage;
  archivePage = archivePage;
  archivePlatformPage = archivePlatformPage;
  offlinePage = offlinePage;
  offlinePlatformPage = offlinePlatformPage;
  private getExistingPage = getExistingPage;
  private assertSlugAvailable = assertSlugAvailable;
  getDraft = getDraft;
  getPlatformDraft = getPlatformDraft;
  saveDraft = saveDraft;
  savePlatformDraft = savePlatformDraft;
  publishPage = publishPage;
  publishPlatformPage = publishPlatformPage;
  duplicatePage = duplicatePage;
  duplicatePlatformPage = duplicatePlatformPage;
  private getNextVersionNo = getNextVersionNo;
  private getOrCreateDraftVersion = getOrCreateDraftVersion;
  private generateCopySlug = generateCopySlug;
  getPublishedPageBySlug = getPublishedPageBySlug;
  createH5Session = createH5Session;
  private resolveH5MarketingIdentity = resolveH5MarketingIdentity;
  private isWithinDisplayWindow = isWithinDisplayWindow;
  submitLead = submitLead;
  trackEvent = trackEvent;
  listLeads = listLeads;
  updateLead = updateLead;
  convertLeadToCustomer = convertLeadToCustomer;
}

export const marketingPageService = new MarketingPageService();

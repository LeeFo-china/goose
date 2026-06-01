import { SupabaseDB } from "@/utils/supabase";
import {
  type MarketingPageRecord,
  type UntypedTable,
} from "./legacy/shared";
import {
  listPages,
  listPublishedPageEntries,
  listActivePublishedPages,
  listProjectOptions,
  listLatestProjectLogCoverImages,
} from "./legacy/queries";
import {
  findPageById,
  findPageBySlug,
  findPageBySlugAndPlatform,
  findTenantBySlug,
  findPageBySlugAndTenantId,
  createPage,
  updatePage,
  updatePageSortOrder,
  archivePage,
  setPageOffline,
} from "./legacy/pages";
import {
  getLatestVersionNo,
  findDraftVersion,
  findVersionById,
  createVersion,
  updateDraftVersion,
  archivePublishedVersions,
  markPagePublished,
} from "./legacy/versions";
import {
  createLead,
  findRecentLeadByPageAndPhone,
  updateRecentLeadSubmission,
  findCustomerByAuthUserId,
  listLeads,
  updateLead,
  convertLeadToCustomer,
  findCustomerIdByPhone,
  findLeadById,
  findCustomerByPhone,
  createCustomerFromLead,
} from "./legacy/leads";
import {
  createEvent,
  ensureUniqueViolation,
} from "./legacy/events";

export type {
  MarketingPageRecord,
  MarketingPageVersionRecord,
  MarketingLeadRecord,
  MarketingEventRecord,
  MarketingPageProjectOptionRow,
} from "./legacy/shared";

class MarketingPageRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string): UntypedTable {
    return (this.client as unknown as {
      from: (tableName: string) => UntypedTable;
    }).from(table);
  }

  private pages() {
    return this.from("marketing_pages");
  }

  private versions() {
    return this.from("marketing_page_versions");
  }

  private leads() {
    return this.from("marketing_leads");
  }

  private events() {
    return this.from("marketing_events");
  }

  private tenants() {
    return this.from("tenants");
  }

  private customers() {
    return this.from("customers");
  }

  private projects() {
    return this.from("projects");
  }

  private projectLogs() {
    return this.from("project_logs");
  }

  private applyProjectIdsFilter(
    request: UntypedTable,
    visibleProjectIds: string[] | null,
  ) {
    if (visibleProjectIds === null) {
      return request;
    }

    if (visibleProjectIds.length === 0) {
      return request.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    return request.in("id", visibleProjectIds);
  }

  private applyTenantScope(
    request: UntypedTable,
    input: { tenantId?: string | null; platformScope?: boolean },
  ) {
    if (input.tenantId) {
      return request.eq("tenant_id", input.tenantId);
    }

    if (input.platformScope) {
      return request.is("tenant_id", null);
    }

    return request;
  }

  listPages = listPages;
  listPublishedPageEntries = listPublishedPageEntries;
  listActivePublishedPages = listActivePublishedPages;
  listProjectOptions = listProjectOptions;
  listLatestProjectLogCoverImages = listLatestProjectLogCoverImages;
  findPageById = findPageById;
  findPageBySlug = findPageBySlug;
  findPageBySlugAndPlatform = findPageBySlugAndPlatform;
  findTenantBySlug = findTenantBySlug;
  findPageBySlugAndTenantId = findPageBySlugAndTenantId;
  createPage = createPage;
  updatePage = updatePage;
  updatePageSortOrder = updatePageSortOrder;
  archivePage = archivePage;
  setPageOffline = setPageOffline;
  getLatestVersionNo = getLatestVersionNo;
  findDraftVersion = findDraftVersion;
  findVersionById = findVersionById;
  createVersion = createVersion;
  updateDraftVersion = updateDraftVersion;
  archivePublishedVersions = archivePublishedVersions;
  markPagePublished = markPagePublished;
  createLead = createLead;
  findRecentLeadByPageAndPhone = findRecentLeadByPageAndPhone;
  updateRecentLeadSubmission = updateRecentLeadSubmission;
  findCustomerByAuthUserId = findCustomerByAuthUserId;
  listLeads = listLeads;
  updateLead = updateLead;
  convertLeadToCustomer = convertLeadToCustomer;
  createEvent = createEvent;
  ensureUniqueViolation = ensureUniqueViolation;
  private findCustomerIdByPhone = findCustomerIdByPhone;
  private findLeadById = findLeadById;
  private findCustomerByPhone = findCustomerByPhone;
  private createCustomerFromLead = createCustomerFromLead;
}

export const marketingPageRepository = new MarketingPageRepository();

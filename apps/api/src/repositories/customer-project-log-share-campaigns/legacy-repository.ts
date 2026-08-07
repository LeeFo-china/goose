import {
  findActiveByOwner,
  findByShareToken,
  findById,
  findByVoucherToken,
  listByProject,
  listRewardCandidatesByProject,
  findLatestActiveByMarketingCampaign,
  findActiveByProject,
} from "./legacy/queries";
import {
  create,
  updateMetrics,
  updateRewardMetadata,
  claimRewardByVoucherIfUnclaimed,
  touchPosterSavedAt,
  touchLatestOpenedAt,
  updateStatus,
} from "./legacy/campaigns";
import { createOpen, findAssist, createAssist, countAssists, listValidAssists } from "./legacy/engagement";
import { countByProjectStatus, countByMarketingCampaignStatus, getStatsSummary } from "./legacy/stats";
import { listForEmployee } from "./legacy/employee-list";

export type {
  CustomerProjectLogShareAssistRow,
  CustomerProjectLogShareCampaignRow,
  EmployeeShareCampaignListRow,
} from "./legacy/shared";

class CustomerProjectLogShareCampaignRepository {
  findActiveByOwner = findActiveByOwner;
  findByShareToken = findByShareToken;
  findById = findById;
  findByVoucherToken = findByVoucherToken;
  listByProject = listByProject;
  listRewardCandidatesByProject = listRewardCandidatesByProject;
  findLatestActiveByMarketingCampaign = findLatestActiveByMarketingCampaign;
  create = create;
  updateMetrics = updateMetrics;
  updateRewardMetadata = updateRewardMetadata;
  claimRewardByVoucherIfUnclaimed = claimRewardByVoucherIfUnclaimed;
  touchPosterSavedAt = touchPosterSavedAt;
  touchLatestOpenedAt = touchLatestOpenedAt;
  createOpen = createOpen;
  findAssist = findAssist;
  createAssist = createAssist;
  countAssists = countAssists;
  listValidAssists = listValidAssists;
  countByProjectStatus = countByProjectStatus;
  countByMarketingCampaignStatus = countByMarketingCampaignStatus;
  findActiveByProject = findActiveByProject;
  listForEmployee = listForEmployee;
  updateStatus = updateStatus;
  getStatsSummary = getStatsSummary;
}

export const customerProjectLogShareCampaignRepository =
  new CustomerProjectLogShareCampaignRepository();

import { customerProjectLogShareCampaignRepository as legacyCustomerProjectLogShareCampaignRepository } from "./customer-project-log-share-campaigns/legacy-repository";

export type {
  CustomerProjectLogShareAssistRow,
  CustomerProjectLogShareCampaignRow,
  EmployeeShareCampaignListRow,
} from "./customer-project-log-share-campaigns/legacy-repository";

type LegacyCustomerProjectLogShareCampaignRepository =
  typeof legacyCustomerProjectLogShareCampaignRepository;

class CustomerProjectLogShareCampaignRepository {
  findActiveByOwner(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["findActiveByOwner"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.findActiveByOwner(...args);
  }

  findByShareToken(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["findByShareToken"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.findByShareToken(...args);
  }

  findById(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["findById"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.findById(...args);
  }

  findByVoucherToken(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["findByVoucherToken"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.findByVoucherToken(...args);
  }

  listByProject(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["listByProject"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.listByProject(...args);
  }

  create(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["create"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.create(...args);
  }

  updateMetrics(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["updateMetrics"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.updateMetrics(...args);
  }

  updateRewardMetadata(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["updateRewardMetadata"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.updateRewardMetadata(...args);
  }

  touchPosterSavedAt(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["touchPosterSavedAt"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.touchPosterSavedAt(...args);
  }

  touchLatestOpenedAt(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["touchLatestOpenedAt"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.touchLatestOpenedAt(...args);
  }

  createOpen(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["createOpen"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.createOpen(...args);
  }

  findAssist(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["findAssist"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.findAssist(...args);
  }

  createAssist(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["createAssist"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.createAssist(...args);
  }

  countAssists(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["countAssists"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.countAssists(...args);
  }

  listValidAssists(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["listValidAssists"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.listValidAssists(...args);
  }

  countByProjectStatus(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["countByProjectStatus"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.countByProjectStatus(...args);
  }

  countByMarketingCampaignStatus(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["countByMarketingCampaignStatus"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.countByMarketingCampaignStatus(...args);
  }

  findActiveByProject(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["findActiveByProject"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.findActiveByProject(...args);
  }

  listForEmployee(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["listForEmployee"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.listForEmployee(...args);
  }

  updateStatus(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["updateStatus"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.updateStatus(...args);
  }

  getStatsSummary(...args: Parameters<LegacyCustomerProjectLogShareCampaignRepository["getStatsSummary"]>) {
    return legacyCustomerProjectLogShareCampaignRepository.getStatsSummary(...args);
  }
}

export const customerProjectLogShareCampaignRepository =
  new CustomerProjectLogShareCampaignRepository();

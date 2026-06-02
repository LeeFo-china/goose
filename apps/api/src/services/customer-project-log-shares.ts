import { customerProjectLogShareService as legacyCustomerProjectLogShareService } from "./customer-project-log-shares/legacy-service";

type LegacyCustomerProjectLogShareService = typeof legacyCustomerProjectLogShareService;

class CustomerProjectLogShareService {
  generateShareCopies(...args: Parameters<LegacyCustomerProjectLogShareService["generateShareCopies"]>) {
    return legacyCustomerProjectLogShareService.generateShareCopies(...args);
  }

  getShareCard(...args: Parameters<LegacyCustomerProjectLogShareService["getShareCard"]>) {
    return legacyCustomerProjectLogShareService.getShareCard(...args);
  }

  getShareCampaignQrcodeBuffer(...args: Parameters<LegacyCustomerProjectLogShareService["getShareCampaignQrcodeBuffer"]>) {
    return legacyCustomerProjectLogShareService.getShareCampaignQrcodeBuffer(...args);
  }

  getRewardClaimVoucherQrcodeBuffer(...args: Parameters<LegacyCustomerProjectLogShareService["getRewardClaimVoucherQrcodeBuffer"]>) {
    return legacyCustomerProjectLogShareService.getRewardClaimVoucherQrcodeBuffer(...args);
  }

  getAppointmentRewardClaimVoucherQrcodeBuffer(...args: Parameters<LegacyCustomerProjectLogShareService["getAppointmentRewardClaimVoucherQrcodeBuffer"]>) {
    return legacyCustomerProjectLogShareService.getAppointmentRewardClaimVoucherQrcodeBuffer(...args);
  }

  getOrCreateShareCampaign(...args: Parameters<LegacyCustomerProjectLogShareService["getOrCreateShareCampaign"]>) {
    return legacyCustomerProjectLogShareService.getOrCreateShareCampaign(...args);
  }

  getShareCampaignDetail(...args: Parameters<LegacyCustomerProjectLogShareService["getShareCampaignDetail"]>) {
    return legacyCustomerProjectLogShareService.getShareCampaignDetail(...args);
  }

  openShareCampaign(...args: Parameters<LegacyCustomerProjectLogShareService["openShareCampaign"]>) {
    return legacyCustomerProjectLogShareService.openShareCampaign(...args);
  }

  assistShareCampaign(...args: Parameters<LegacyCustomerProjectLogShareService["assistShareCampaign"]>) {
    return legacyCustomerProjectLogShareService.assistShareCampaign(...args);
  }

  createShareRecord(...args: Parameters<LegacyCustomerProjectLogShareService["createShareRecord"]>) {
    return legacyCustomerProjectLogShareService.createShareRecord(...args);
  }

  getCustomerProjectCampaignSummary(...args: Parameters<LegacyCustomerProjectLogShareService["getCustomerProjectCampaignSummary"]>) {
    return legacyCustomerProjectLogShareService.getCustomerProjectCampaignSummary(...args);
  }

  getCustomerCampaignDetail(...args: Parameters<LegacyCustomerProjectLogShareService["getCustomerCampaignDetail"]>) {
    return legacyCustomerProjectLogShareService.getCustomerCampaignDetail(...args);
  }

  listCustomerCampaignHelpers(...args: Parameters<LegacyCustomerProjectLogShareService["listCustomerCampaignHelpers"]>) {
    return legacyCustomerProjectLogShareService.listCustomerCampaignHelpers(...args);
  }

  getOrCreateCustomerAppointmentRewardCampaign(...args: Parameters<LegacyCustomerProjectLogShareService["getOrCreateCustomerAppointmentRewardCampaign"]>) {
    return legacyCustomerProjectLogShareService.getOrCreateCustomerAppointmentRewardCampaign(...args);
  }

  getCustomerAppointmentRewardCampaign(...args: Parameters<LegacyCustomerProjectLogShareService["getCustomerAppointmentRewardCampaign"]>) {
    return legacyCustomerProjectLogShareService.getCustomerAppointmentRewardCampaign(...args);
  }

  submitCustomerAppointmentRewardCampaign(...args: Parameters<LegacyCustomerProjectLogShareService["submitCustomerAppointmentRewardCampaign"]>) {
    return legacyCustomerProjectLogShareService.submitCustomerAppointmentRewardCampaign(...args);
  }

  getEmployeeProjectCampaignConfig(...args: Parameters<LegacyCustomerProjectLogShareService["getEmployeeProjectCampaignConfig"]>) {
    return legacyCustomerProjectLogShareService.getEmployeeProjectCampaignConfig(...args);
  }

  saveEmployeeProjectCampaignConfig(...args: Parameters<LegacyCustomerProjectLogShareService["saveEmployeeProjectCampaignConfig"]>) {
    return legacyCustomerProjectLogShareService.saveEmployeeProjectCampaignConfig(...args);
  }

  updateEmployeeProjectCampaignConfigStatus(...args: Parameters<LegacyCustomerProjectLogShareService["updateEmployeeProjectCampaignConfigStatus"]>) {
    return legacyCustomerProjectLogShareService.updateEmployeeProjectCampaignConfigStatus(...args);
  }

  listEmployeeShareCampaigns(...args: Parameters<LegacyCustomerProjectLogShareService["listEmployeeShareCampaigns"]>) {
    return legacyCustomerProjectLogShareService.listEmployeeShareCampaigns(...args);
  }

  listMarketingCampaigns(...args: Parameters<LegacyCustomerProjectLogShareService["listMarketingCampaigns"]>) {
    return legacyCustomerProjectLogShareService.listMarketingCampaigns(...args);
  }

  listMarketingCampaignTemplates(...args: Parameters<LegacyCustomerProjectLogShareService["listMarketingCampaignTemplates"]>) {
    return legacyCustomerProjectLogShareService.listMarketingCampaignTemplates(...args);
  }

  getMarketingCampaignTemplateDetail(...args: Parameters<LegacyCustomerProjectLogShareService["getMarketingCampaignTemplateDetail"]>) {
    return legacyCustomerProjectLogShareService.getMarketingCampaignTemplateDetail(...args);
  }

  createMarketingCampaignTemplate(...args: Parameters<LegacyCustomerProjectLogShareService["createMarketingCampaignTemplate"]>) {
    return legacyCustomerProjectLogShareService.createMarketingCampaignTemplate(...args);
  }

  updateMarketingCampaignTemplate(...args: Parameters<LegacyCustomerProjectLogShareService["updateMarketingCampaignTemplate"]>) {
    return legacyCustomerProjectLogShareService.updateMarketingCampaignTemplate(...args);
  }

  updateMarketingCampaignTemplateStatus(...args: Parameters<LegacyCustomerProjectLogShareService["updateMarketingCampaignTemplateStatus"]>) {
    return legacyCustomerProjectLogShareService.updateMarketingCampaignTemplateStatus(...args);
  }

  getMarketingCampaignDetail(...args: Parameters<LegacyCustomerProjectLogShareService["getMarketingCampaignDetail"]>) {
    return legacyCustomerProjectLogShareService.getMarketingCampaignDetail(...args);
  }

  createMarketingCampaign(...args: Parameters<LegacyCustomerProjectLogShareService["createMarketingCampaign"]>) {
    return legacyCustomerProjectLogShareService.createMarketingCampaign(...args);
  }

  updateMarketingCampaign(...args: Parameters<LegacyCustomerProjectLogShareService["updateMarketingCampaign"]>) {
    return legacyCustomerProjectLogShareService.updateMarketingCampaign(...args);
  }

  updateMarketingCampaignStatus(...args: Parameters<LegacyCustomerProjectLogShareService["updateMarketingCampaignStatus"]>) {
    return legacyCustomerProjectLogShareService.updateMarketingCampaignStatus(...args);
  }

  listMarketingCampaignInstances(...args: Parameters<LegacyCustomerProjectLogShareService["listMarketingCampaignInstances"]>) {
    return legacyCustomerProjectLogShareService.listMarketingCampaignInstances(...args);
  }

  getEmployeeAppointmentRewardCampaignDetail(...args: Parameters<LegacyCustomerProjectLogShareService["getEmployeeAppointmentRewardCampaignDetail"]>) {
    return legacyCustomerProjectLogShareService.getEmployeeAppointmentRewardCampaignDetail(...args);
  }

  confirmEmployeeAppointmentRewardArrive(...args: Parameters<LegacyCustomerProjectLogShareService["confirmEmployeeAppointmentRewardArrive"]>) {
    return legacyCustomerProjectLogShareService.confirmEmployeeAppointmentRewardArrive(...args);
  }

  claimEmployeeAppointmentReward(...args: Parameters<LegacyCustomerProjectLogShareService["claimEmployeeAppointmentReward"]>) {
    return legacyCustomerProjectLogShareService.claimEmployeeAppointmentReward(...args);
  }

  getEmployeeShareCampaignDetail(...args: Parameters<LegacyCustomerProjectLogShareService["getEmployeeShareCampaignDetail"]>) {
    return legacyCustomerProjectLogShareService.getEmployeeShareCampaignDetail(...args);
  }

  listEmployeeShareCampaignHelpers(...args: Parameters<LegacyCustomerProjectLogShareService["listEmployeeShareCampaignHelpers"]>) {
    return legacyCustomerProjectLogShareService.listEmployeeShareCampaignHelpers(...args);
  }

  updateEmployeeShareCampaignStatus(...args: Parameters<LegacyCustomerProjectLogShareService["updateEmployeeShareCampaignStatus"]>) {
    return legacyCustomerProjectLogShareService.updateEmployeeShareCampaignStatus(...args);
  }

  getEmployeeShareCampaignStatsSummary(...args: Parameters<LegacyCustomerProjectLogShareService["getEmployeeShareCampaignStatsSummary"]>) {
    return legacyCustomerProjectLogShareService.getEmployeeShareCampaignStatsSummary(...args);
  }

  getCampaignMetaForEmployeeClaim(...args: Parameters<LegacyCustomerProjectLogShareService["getCampaignMetaForEmployeeClaim"]>) {
    return legacyCustomerProjectLogShareService.getCampaignMetaForEmployeeClaim(...args);
  }

  getVoucherMetaForEmployeeClaim(...args: Parameters<LegacyCustomerProjectLogShareService["getVoucherMetaForEmployeeClaim"]>) {
    return legacyCustomerProjectLogShareService.getVoucherMetaForEmployeeClaim(...args);
  }

  getEmployeeVoucherDetail(...args: Parameters<LegacyCustomerProjectLogShareService["getEmployeeVoucherDetail"]>) {
    return legacyCustomerProjectLogShareService.getEmployeeVoucherDetail(...args);
  }

  claimCampaignReward(...args: Parameters<LegacyCustomerProjectLogShareService["claimCampaignReward"]>) {
    return legacyCustomerProjectLogShareService.claimCampaignReward(...args);
  }

  claimCampaignRewardByVoucher(...args: Parameters<LegacyCustomerProjectLogShareService["claimCampaignRewardByVoucher"]>) {
    return legacyCustomerProjectLogShareService.claimCampaignRewardByVoucher(...args);
  }
}

export const customerProjectLogShareService = new CustomerProjectLogShareService();

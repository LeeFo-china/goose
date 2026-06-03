import { customerServiceConfigRepository } from "@/repositories/customer-service-config";
import { customerServiceTicketService } from "@/services/customer-service-tickets";

class CustomerServiceConfigService {
  async getCustomerServiceConfig(tenantId: string | null | undefined) {
    const directConfig = await customerServiceConfigRepository.getConfig(tenantId);
    if (directConfig) return directConfig;
    return customerServiceTicketService.getCustomerServiceConfig(tenantId);
  }
}

export const customerServiceConfigService =
  new CustomerServiceConfigService();

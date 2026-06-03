import { customerBootstrapAuthRepository } from "@/repositories/customer-bootstrap-auth";

class CustomerBootstrapAuthService {
  verifyWechatCustomerBootstrap(input: {
    userId: string;
    openid: string;
    tenantId?: string | null;
    customerId?: string | null;
    employeeId?: string | null;
    page: number;
    pageSize: number;
  }) {
    return customerBootstrapAuthRepository.verifyWechatCustomerBootstrap(input);
  }
}

export const customerBootstrapAuthService =
  new CustomerBootstrapAuthService();

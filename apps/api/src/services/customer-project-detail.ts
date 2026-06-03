import { Errors } from "@/errors/error-factory";
import { customerProjectDetailRepository } from "@/repositories/customer-project-detail";

class CustomerProjectDetailService {
  async getOwnedProject(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
  }) {
    const project = await customerProjectDetailRepository.findOwnedProject(input);
    if (!project) throw Errors.notFound("项目不存在");
    return project;
  }
}

export const customerProjectDetailService =
  new CustomerProjectDetailService();

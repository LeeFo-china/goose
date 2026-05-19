import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { projectCreatePageDataRepository } from "@/repositories/project-create-page-data";

class ProjectCreatePageDataService {
  getCreatePageData(authContext: AuthContext) {
    accessPolicyService.assertPermission(authContext, "project.create");
    return projectCreatePageDataRepository.getCreatePageData();
  }
}

export const projectCreatePageDataService = new ProjectCreatePageDataService();

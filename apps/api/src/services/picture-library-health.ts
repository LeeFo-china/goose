import { pictureLibraryHealthRepository } from "@/repositories/picture-library-health";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

class PictureLibraryHealthService {
  async buildReport(input: {
    authContext?: AuthContext;
    issueLimit?: number;
  } = {}) {
    if (input.authContext && !input.authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
    return pictureLibraryHealthRepository.buildReport(input.issueLimit);
  }
}

export const pictureLibraryHealthService = new PictureLibraryHealthService();

import { BaseController } from "@/controllers/BaseController";
import {
  CreateExternalReferrerSchema,
  UpdateExternalReferrerSchema,
} from "@/schema/project-referrals";

class ExternalReferrersController extends BaseController<
  typeof CreateExternalReferrerSchema,
  typeof UpdateExternalReferrerSchema
> {
  constructor() {
    super(
      "external_referrers",
      CreateExternalReferrerSchema,
      UpdateExternalReferrerSchema,
    );
  }
}

export default new ExternalReferrersController();

import { Errors } from "@/errors/error-factory";
import { authorizationService } from "@/services/authorization";
import { uploadService } from "@/services/uploads";
import type { JwtPayload } from "@/utils/jwt";

export async function assertApplymentUploadSceneAccess(
  user: JwtPayload,
  scene: string,
) {
  if (scene !== "wechat_pay_applyment") return;
  if (!user.sub) throw Errors.unauthorized();
  const authContext = await authorizationService.getRequiredAuthContext(
    user.sub,
  );
  uploadService.assertDirectUploadAccess({ authContext, scene });
}

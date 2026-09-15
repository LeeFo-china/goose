import type { DouyinAppContext } from "../../app";
import { fetchPublishedStyleDetail } from "../../api/rendering-styles";
import { completeRenderingUploadWithRetry, createRenderingUploadIntent, putRenderingBytes } from "../../api/rendering-uploads";
import { fetchRenderingUploadStatus, fetchRenderingUploadPreview } from "../../api/rendering-uploads";
import { authorizeRenderingPhone, createRenderingJob, fetchRenderingJobStatus,
  fetchRenderingPhoneState } from "../../api/rendering-jobs";
import { choosePrivateImage } from "../../platform/private-image";
import { clearRenderingRecovery, readRenderingRecovery, writeRenderingRecovery } from "../../platform/rendering-recovery";
import { replacePage } from "../../platform/navigation";
import { createRenderingStyleDetailPageDefinition } from "./page";

Page(createRenderingStyleDetailPageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  fetchPublishedStyleDetail,
  choosePrivateImage,
  createRenderingUploadIntent,
  putRenderingBytes,
  completeRenderingUploadWithRetry,
  fetchRenderingUploadStatus,
  fetchRenderingUploadPreview,
  previewImage: (options) => { tt.previewImage(options); },
  createRenderingJob,
  fetchRenderingJobStatus,
  fetchRenderingPhoneState,
  authorizeRenderingPhone,
  readRenderingRecovery,
  writeRenderingRecovery,
  clearRenderingRecovery,
  resolveRecoveryIdentity: (app) => app.getRenderingRecoveryIdentity(),
  navigateToList: () => replacePage("pages/rendering-styles/index"),
  showToast: (options) => { void tt.showToast(options); },
}));

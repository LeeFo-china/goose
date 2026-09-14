import type { DouyinAppContext } from "../../app";
import { fetchPublishedStyleDetail } from "../../api/rendering-styles";
import { completeRenderingUploadWithRetry, createRenderingUploadIntent, putRenderingBytes } from "../../api/rendering-uploads";
import { choosePrivateImage } from "../../platform/private-image";
import { replacePage } from "../../platform/navigation";
import { createRenderingStyleDetailPageDefinition } from "./page";

Page(createRenderingStyleDetailPageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  fetchPublishedStyleDetail,
  choosePrivateImage,
  createRenderingUploadIntent,
  putRenderingBytes,
  completeRenderingUploadWithRetry,
  navigateToList: () => replacePage("pages/rendering-styles/index"),
  showToast: (options) => { void tt.showToast(options); },
}));

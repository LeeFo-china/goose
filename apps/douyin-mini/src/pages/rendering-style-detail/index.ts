import type { DouyinAppContext } from "../../app";
import { fetchPublishedStyleDetail } from "../../api/rendering-styles";
import { replacePage } from "../../platform/navigation";
import { createRenderingStyleDetailPageDefinition } from "./page";

Page(createRenderingStyleDetailPageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  fetchPublishedStyleDetail,
  navigateToList: () => replacePage("pages/rendering-styles/index"),
  showToast: (options) => { void tt.showToast(options); },
}));

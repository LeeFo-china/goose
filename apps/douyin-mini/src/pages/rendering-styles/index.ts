import type { DouyinAppContext } from "../../app";
import { fetchPublishedStyles } from "../../api/rendering-styles";
import { navigateToRenderingStyleDetail } from "../../platform/navigation";
import { createRenderingStylesPageDefinition } from "./page";

Page(createRenderingStylesPageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  fetchPublishedStyles,
  navigateToDetail: navigateToRenderingStyleDetail,
  stopPullDownRefresh: () => { void tt.stopPullDownRefresh({}); },
  showToast: (options) => { void tt.showToast(options); },
}));

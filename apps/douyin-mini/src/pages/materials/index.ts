import type { DouyinAppContext } from "../../app";
import { fetchMaterials } from "../../api/materials";
import { navigateToMaterialDetail, navigateToPage } from "../../platform/navigation";
import { createMaterialsPageDefinition } from "./page";

Page(createMaterialsPageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  fetchMaterials,
  navigateToMaterialDetail,
  navigateToPage,
  showToast: (options) => { void tt.showToast(options); },
  stopPullDownRefresh: () => { void tt.stopPullDownRefresh({}); },
}));

import type { DouyinAppContext } from "../../app";
import { clearOwnedMaterials, fetchOwnedMaterials, removeOwnedMaterial } from "../../api/materials";
import { navigateToOwnedMaterialDetail, navigateToPage } from "../../platform/navigation";
import { createMyMaterialsPageDefinition } from "./page";

Page(createMyMaterialsPageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  fetchOwnedMaterials,
  removeOwnedMaterial,
  clearOwnedMaterials,
  navigateToOwnedMaterialDetail,
  navigateToPage,
  showModal: (options) => { tt.showModal(options); },
  showToast: (options) => { void tt.showToast(options); },
  stopPullDownRefresh: () => { void tt.stopPullDownRefresh({}); },
}));

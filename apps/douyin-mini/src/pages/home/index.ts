import type { DouyinAppContext } from "../../app";
import { fetchMaterials } from "../../api/materials";
import {
  navigateToEntityDetail, navigateToMaterialDetail, navigateToPage, switchToTab,
} from "../../platform/navigation";
import { createHomePageDefinition } from "./page";

Page(createHomePageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  fetchMaterials,
  navigateToEntityDetail,
  navigateToMaterialDetail,
  navigateToPage,
  switchToTab,
  showToast: (options) => { void tt.showToast(options); },
}));

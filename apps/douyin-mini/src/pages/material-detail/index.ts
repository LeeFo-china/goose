import type { DouyinAppContext } from "../../app";
import {
  claimMaterial,
  fetchMaterialPreview,
  fetchOwnedMaterialDetail,
  toMaterialBusinessError,
} from "../../api/materials";
import { copyTextToClipboard } from "../../platform/clipboard";
import { navigateToPage, switchToTab } from "../../platform/navigation";
import { createMaterialDetailPageDefinition } from "./page";

Page(createMaterialDetailPageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  claimMaterial,
  fetchMaterialPreview,
  fetchOwnedMaterialDetail,
  toMaterialBusinessError,
  copyTextToClipboard,
  navigateToPage,
  switchToTab,
  showToast: (options) => { void tt.showToast(options); },
}));

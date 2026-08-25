import type { DouyinAppContext } from "../../app";
import { askDecorationQuestion } from "../../api/qa";
import { switchToTab } from "../../platform/navigation";
import { createQaPageDefinition } from "./qa-page";

Page(createQaPageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  askDecorationQuestion,
  switchToTab,
  showToast: (options) => { void tt.showToast(options); },
}));

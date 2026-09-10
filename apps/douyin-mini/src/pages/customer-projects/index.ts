import type { DouyinAppContext } from "../../app";
import { fetchCustomerProjects } from "../../api/customer";
import {
  navigateToCustomerProjectDetail,
  navigateToPage,
} from "../../platform/navigation";
import { createCustomerProjectsPageDefinition } from "./page";

Page(createCustomerProjectsPageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  fetchCustomerProjects,
  navigateToCustomerProjectDetail,
  navigateToPage,
  showToast: (options) => { void tt.showToast(options); },
  stopPullDownRefresh: () => { void tt.stopPullDownRefresh({}); },
}));

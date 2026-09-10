import type { DouyinAppContext } from "../../app";
import {
  fetchCustomerProjectDetail,
  fetchCustomerProjectLogs,
} from "../../api/customer";
import { createCustomerProjectDetailPageDefinition } from "./page";

Page(createCustomerProjectDetailPageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  fetchCustomerProjectDetail,
  fetchCustomerProjectLogs,
  showToast: (options) => { void tt.showToast(options); },
  stopPullDownRefresh: () => { void tt.stopPullDownRefresh({}); },
}));

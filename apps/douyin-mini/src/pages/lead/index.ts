import type { DouyinAppContext } from "../../app";
import { sendLeadSms, submitLead } from "../../api/leads";
import { readBudgetLeadContext } from "../../platform/budget-lead-context";
import { navigateToPage } from "../../platform/navigation";
import {
  readMeasurementSuccessContext,
  writeMeasurementSuccessContext,
} from "../../platform/measurement-success-context";
import { createLeadPageDefinition } from "./lead-page";

Page(createLeadPageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  sendLeadSms,
  submitLead,
  readBudgetLeadContext,
  readMeasurementSuccessContext,
  writeMeasurementSuccessContext,
  navigateToPage,
  showToast: (options) => { void tt.showToast(options); },
  makePhoneCall: (options) => { tt.makePhoneCall(options); },
}));

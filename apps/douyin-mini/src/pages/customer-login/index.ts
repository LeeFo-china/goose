import type { DouyinAppContext } from "../../app";
import {
  authorizeDouyinCustomerPhone,
  selectDouyinCustomerIdentity,
  sendDouyinCustomerSmsCode,
  verifyDouyinCustomerSms,
} from "../../api/customer-auth";
import { navigateToPage } from "../../platform/navigation";
import { createCustomerLoginPageDefinition } from "./page";

Page(createCustomerLoginPageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  authorizeDouyinCustomerPhone,
  sendDouyinCustomerSmsCode,
  verifyDouyinCustomerSms,
  selectDouyinCustomerIdentity,
  navigateToPage,
}));

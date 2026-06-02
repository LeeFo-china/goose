import {
  assertCustomerCanBind,
  assertEmployeeCanBind,
} from "./legacy/assertions";
import { create, list } from "./legacy/requests";
import { approve, reject } from "./legacy/review";
import { unbindCustomer, unbindEmployee } from "./legacy/unbind";

class WechatRebindRequestService {
  assertCustomerCanBind = assertCustomerCanBind;
  assertEmployeeCanBind = assertEmployeeCanBind;
  unbindCustomer = unbindCustomer;
  unbindEmployee = unbindEmployee;
  create = create;
  list = list;
  approve = approve;
  reject = reject;
}

export const wechatRebindRequestService = new WechatRebindRequestService();

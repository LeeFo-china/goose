import {
  assignTicket,
  executeAction,
  getTicket,
  listTickets,
} from "./legacy/admin";
import {
  createCustomerTicket,
  getCustomerTicketDetail,
  listCustomerTickets,
} from "./legacy/customer";
import { getCustomerServiceConfig } from "./legacy/settings";

class CustomerServiceTicketService {
  getCustomerServiceConfig = getCustomerServiceConfig;
  createCustomerTicket = createCustomerTicket;
  listCustomerTickets = listCustomerTickets;
  getCustomerTicketDetail = getCustomerTicketDetail;
  listTickets = listTickets;
  getTicket = getTicket;
  assignTicket = assignTicket;
  executeAction = executeAction;
}

export const customerServiceTicketService = new CustomerServiceTicketService();

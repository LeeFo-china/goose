export type CustomerServicePagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CustomerServiceTicketAction = {
  id: string;
  action: string;
  action_label: string;
  from_status: string | null;
  from_status_label: string | null;
  to_status: string | null;
  to_status_label: string | null;
  operator_employee_id: string | null;
  operator_auth_user_id: string | null;
  content: string | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
};

export type CustomerServiceAvailableAction = {
  action: string;
  label: string;
  to: string | null;
  requires_content: boolean;
};

export type CustomerServiceTicket = {
  id: string;
  tenant_id: string;
  ticket_no: string;
  customer_id: string;
  project_id: string | null;
  category: string;
  category_label: string;
  title: string | null;
  content: string;
  images: string[];
  image_items?: Array<{
    url: string;
    thumb_url: string;
  }>;
  image_count: number;
  status: string;
  status_label: string;
  priority: string;
  priority_label: string;
  assigned_employee_id: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  customer: {
    id: string;
    name: string | null;
    phone_masked: string | null;
    owner_id: string | null;
  } | null;
  project: {
    id: string | null;
    name: string | null;
    status: string | null;
    customer_id: string | null;
  } | null;
  assigned_employee: {
    id: string | null;
    name: string | null;
    phone_masked: string | null;
    status: string | null;
  } | null;
  available_actions: CustomerServiceAvailableAction[];
  actions?: CustomerServiceTicketAction[];
};

export type CustomerServiceTicketListData = {
  list: CustomerServiceTicket[];
  pagination: CustomerServicePagination;
};

export type EmployeeOption = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
};

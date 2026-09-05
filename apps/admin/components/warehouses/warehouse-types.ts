export type WarehouseStatus = "active" | "inactive";

export type Warehouse = {
  id: string;
  tenant_id: string;
  warehouse_code: string;
  name: string;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  manager_employee_id: string | null;
  is_default: boolean;
  status: WarehouseStatus;
  version: number;
  created_at: string;
  updated_at: string;
};

export type WarehousePage = {
  list: Warehouse[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type WarehouseDraft = {
  name: string;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  managerEmployeeId?: string | null;
  isDefault?: boolean;
};

export type WarehouseCreateRequest = {
  name: string;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  manager_employee_id: string | null;
  is_default: boolean;
};

export type WarehouseUpdateRequest = Partial<WarehouseCreateRequest> & {
  expected_version: number;
  status?: WarehouseStatus;
};

export type WarehouseDraftErrors = {
  name?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
};

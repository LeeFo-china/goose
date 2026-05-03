export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DepartmentRecord = {
  id: string;
  code: string | null;
  name: string;
  created_at: string | null;
};

export type PostRecord = {
  id: string;
  code: string | null;
  name: string;
  base_salary: number | null;
  salary_type: string | null;
  sort: number | null;
  status: number | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
};

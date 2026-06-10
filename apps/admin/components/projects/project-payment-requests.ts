import { requestBackendJson } from "@/lib/backend-client";

export type ProjectPaymentRecord = {
  id: string;
  project_id: string | null;
  amount: number | null;
  type: string | null;
  status: string | null;
  created_at: string | null;
};

export type ProjectPaymentListData = {
  list: ProjectPaymentRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type ProjectPaymentCreateInput = {
  project_id: string;
  amount: number;
  type: string;
  status: "confirmed";
};

export async function fetchProjectPayments(query: {
  projectId: string;
  type: string;
  status?: string;
}) {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "100",
    project_id: query.projectId,
    type: query.type,
  });
  if (query.status) params.set("status", query.status);

  return requestBackendJson<ProjectPaymentListData>(`/payments?${params}`, {
    cache: "no-store",
    fallbackMessage: "收款记录加载失败",
  });
}

export async function createProjectPayment(input: ProjectPaymentCreateInput) {
  return requestBackendJson<ProjectPaymentRecord>("/payments", {
    method: "POST",
    body: JSON.stringify(input),
    fallbackMessage: "登记收款失败",
  });
}

# 费用申请前端请求封装与页面状态示例

本文档是对 [2026-04-19-frontend-expense-requests-integration-summary.md](/Users/leefo/Public/work/gooes/docs/2026-04-19-frontend-expense-requests-integration-summary.md:1) 的补充。

目标只有一个：让前端可以直接照着写，请求参数、返回结构、页面状态和按钮控制一次对齐。

---

## 1. 建议前端先统一这几个类型

```ts
export type ApiSuccess<T> = {
  data: T;
  message: string;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PagedData<T> = {
  list: T[];
  pagination: Pagination;
};

export type ExpenseRequestItem = {
  id: string;
  occurred_at: string | null;
  category: string;
  amount: number;
  remark: string | null;
  invoice_no: string | null;
  vendor_name: string | null;
  evidence_images: string[];
  created_at: string;
  updated_at: string;
};

export type ExpenseRequestApproval = {
  id: string;
  step:
    | "draft"
    | "manager_review"
    | "finance_review"
    | "payment"
    | "done"
    | "cancelled";
  action:
    | "submit"
    | "approve"
    | "reject"
    | "cancel"
    | "resubmit"
    | "pay";
  approver_id: string | null;
  comment: string | null;
  created_at: string;
  approver: {
    id: string;
    name: string | null;
    phone: string | null;
    role: string | null;
    status: string | null;
  } | null;
};

export type ExpenseRequestSettlement = {
  id: string;
  payee_name: string;
  payee_bank: string | null;
  payee_account: string | null;
  method: "bank_transfer" | "wechat" | "alipay" | "cash";
  paid_amount: number;
  paid_at: string;
  paid_by: string | null;
  evidence_images: string[];
  remark: string | null;
  created_at: string;
  updated_at: string;
  paid_operator: {
    id: string;
    name: string | null;
    phone: string | null;
    role: string | null;
    status: string | null;
  } | null;
};

export type ExpenseRequestRecord = {
  id: string;
  request_no: string | null;
  employee_id: string;
  project_id: string | null;
  mode: "reimbursement" | "advance" | "direct" | "petty_cash";
  title: string | null;
  total_amount: number;
  status: "draft" | "pending" | "approved" | "rejected" | "paid" | "cancelled";
  current_step:
    | "draft"
    | "manager_review"
    | "finance_review"
    | "payment"
    | "done"
    | "cancelled";
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  assignee_id: string | null;
  rejected_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  employee: {
    id: string;
    name: string | null;
    phone: string | null;
    role: string | null;
    status: string | null;
  } | null;
  project: {
    id: string;
    name: string | null;
    status: string | null;
    signed_amount?: number | null;
    customer_id?: string | null;
  } | null;
  assignee: {
    id: string;
    name: string | null;
    phone: string | null;
    role: string | null;
    status: string | null;
  } | null;
  items: ExpenseRequestItem[];
  approvals: ExpenseRequestApproval[];
  settlement: ExpenseRequestSettlement | null;
};
```

---

## 2. 建议前端统一用一个 `request` 包装

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json?.message || "请求失败");
  }

  return json as T;
}
```

---

## 3. 费用申请 API 封装

```ts
export const expenseRequestApi = {
  list(params: {
    page?: number;
    pageSize?: number;
    employee_id?: string;
    assignee_id?: string;
    project_id?: string;
    status?: ExpenseRequestRecord["status"];
    mode?: ExpenseRequestRecord["mode"];
    current_step?: ExpenseRequestRecord["current_step"];
    keyword?: string;
  }) {
    const search = new URLSearchParams();

    if (params.page) search.set("page", String(params.page));
    if (params.pageSize) search.set("pageSize", String(params.pageSize));
    if (params.employee_id) search.set("employee_id", params.employee_id);
    if (params.assignee_id) search.set("assignee_id", params.assignee_id);
    if (params.project_id) search.set("project_id", params.project_id);
    if (params.status) search.set("status", params.status);
    if (params.mode) search.set("mode", params.mode);
    if (params.current_step) search.set("current_step", params.current_step);
    if (params.keyword) search.set("keyword", params.keyword);

    return request<ApiSuccess<PagedData<ExpenseRequestRecord>>>(
      `/expense-requests?${search.toString()}`,
    );
  },

  getById(id: string) {
    return request<ApiSuccess<ExpenseRequestRecord>>(`/expense-requests/${id}`);
  },

  create(payload: {
    employee_id: string;
    project_id?: string | null;
    mode: ExpenseRequestRecord["mode"];
    title?: string | null;
    items?: Array<{
      occurred_at?: string | null;
      category: string;
      amount: number;
      remark?: string | null;
      invoice_no?: string | null;
      vendor_name?: string | null;
      evidence_images?: string[];
    }>;
  }) {
    return request<ApiSuccess<ExpenseRequestRecord>>("/expense-requests", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(
    id: string,
    payload: {
      project_id?: string | null;
      mode?: ExpenseRequestRecord["mode"];
      title?: string | null;
      items?: Array<{
        occurred_at?: string | null;
        category: string;
        amount: number;
        remark?: string | null;
        invoice_no?: string | null;
        vendor_name?: string | null;
        evidence_images?: string[];
      }>;
    },
  ) {
    return request<ApiSuccess<ExpenseRequestRecord>>(`/expense-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  submit(id: string, payload: { operator_id: string; comment?: string | null }) {
    return request<ApiSuccess<ExpenseRequestRecord>>(
      `/expense-requests/${id}/submit`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  approve(
    id: string,
    payload: { approver_id: string; comment?: string | null },
  ) {
    return request<ApiSuccess<ExpenseRequestRecord>>(
      `/expense-requests/${id}/approve`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  reject(
    id: string,
    payload: {
      approver_id: string;
      rejected_reason: string;
      comment?: string | null;
    },
  ) {
    return request<ApiSuccess<ExpenseRequestRecord>>(
      `/expense-requests/${id}/reject`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  cancel(id: string, payload: { operator_id: string; comment?: string | null }) {
    return request<ApiSuccess<ExpenseRequestRecord>>(
      `/expense-requests/${id}/cancel`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  pay(
    id: string,
    payload: {
      payee_name: string;
      payee_bank?: string | null;
      payee_account?: string | null;
      method: "bank_transfer" | "wechat" | "alipay" | "cash";
      paid_amount: number;
      paid_at?: string;
      paid_by: string;
      evidence_images: string[];
      remark?: string | null;
    },
  ) {
    return request<ApiSuccess<ExpenseRequestRecord>>(
      `/expense-requests/${id}/pay`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },
};
```

---

## 4. 页面初始化推荐写法

详情 / 编辑页建议固定成：

1. 先查详情
2. 用返回的 `status + current_step` 派生按钮状态
3. 用 `items / approvals / settlement` 渲染 3 个区块

```ts
async function loadExpenseRequestDetail(id: string) {
  const result = await expenseRequestApi.getById(id);
  return result.data;
}
```

---

## 5. 页面状态建议

建议不要只用一个 `loading` 和一堆 if 判断乱控按钮，至少拆成：

```ts
type ExpenseDetailState =
  | { kind: "loading" }
  | { kind: "ready"; record: ExpenseRequestRecord };
```

然后再从 `record` 派生权限。

---

## 6. 权限派生建议

```ts
function getExpenseRequestPermissions(record: ExpenseRequestRecord) {
  const isDraft = record.status === "draft";
  const isRejected = record.status === "rejected";
  const isPending = record.status === "pending";
  const isApprovedForPay =
    record.status === "approved" && record.current_step === "payment";
  const isReadonly = ["pending", "approved", "paid", "cancelled"].includes(
    record.status,
  );

  return {
    canEdit: isDraft || isRejected,
    canSubmit: isDraft || isRejected,
    canApprove: isPending,
    canReject: isPending,
    canCancel: ["draft", "pending", "rejected"].includes(record.status),
    canPay: isApprovedForPay,
    isReadonly,
  };
}
```

---

## 7. 草稿创建流程示例

```ts
async function createExpenseDraft(params: {
  employeeId: string;
  projectId?: string | null;
  mode: ExpenseRequestRecord["mode"];
  title?: string | null;
  items?: ExpenseRequestRecord["items"];
}) {
  const result = await expenseRequestApi.create({
    employee_id: params.employeeId,
    project_id: params.projectId ?? null,
    mode: params.mode,
    title: params.title ?? null,
    items: (params.items || []).map((item) => ({
      occurred_at: item.occurred_at,
      category: item.category,
      amount: item.amount,
      remark: item.remark,
      invoice_no: item.invoice_no,
      vendor_name: item.vendor_name,
      evidence_images: item.evidence_images,
    })),
  });

  return result.data;
}
```

---

## 8. 草稿编辑流程示例

```ts
async function saveExpenseDraft(params: {
  id: string;
  projectId?: string | null;
  mode?: ExpenseRequestRecord["mode"];
  title?: string | null;
  items: Array<{
    occurred_at?: string | null;
    category: string;
    amount: number;
    remark?: string | null;
    invoice_no?: string | null;
    vendor_name?: string | null;
    evidence_images?: string[];
  }>;
}) {
  const result = await expenseRequestApi.update(params.id, {
    project_id: params.projectId ?? null,
    mode: params.mode,
    title: params.title ?? null,
    items: params.items,
  });

  return result.data;
}
```

前端要点：

- 明细是整体替换，不是 patch 单条
- 本地编辑时建议始终维护完整 `items` 数组

---

## 9. 提交流程示例

```ts
function validateBeforeSubmit(items: Array<{ amount: number }>) {
  if (!items.length) {
    throw new Error("提交前至少需要一条费用明细");
  }

  const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  if (totalAmount <= 0) {
    throw new Error("费用申请总金额必须大于 0");
  }
}

async function submitExpenseRequest(params: {
  id: string;
  operatorId: string;
  comment?: string | null;
  items: Array<{ amount: number }>;
}) {
  validateBeforeSubmit(params.items);

  const result = await expenseRequestApi.submit(params.id, {
    operator_id: params.operatorId,
    comment: params.comment ?? null,
  });

  return result.data;
}
```

---

## 10. 通过 / 驳回流程示例

```ts
async function approveExpenseRequest(params: {
  id: string;
  approverId: string;
  comment?: string | null;
}) {
  const result = await expenseRequestApi.approve(params.id, {
    approver_id: params.approverId,
    comment: params.comment ?? null,
  });

  return result.data;
}

async function rejectExpenseRequest(params: {
  id: string;
  approverId: string;
  rejectedReason: string;
  comment?: string | null;
}) {
  if (!params.rejectedReason.trim()) {
    throw new Error("驳回原因不能为空");
  }

  const result = await expenseRequestApi.reject(params.id, {
    approver_id: params.approverId,
    rejected_reason: params.rejectedReason,
    comment: params.comment ?? params.rejectedReason,
  });

  return result.data;
}
```

前端要点：

- 一次 `approve` 不一定进入最终通过
- 审批成功后一定重新刷新详情
- 驳回后重新开放编辑

---

## 11. 支付流程示例

```ts
async function payExpenseRequest(params: {
  id: string;
  totalAmount: number;
  payeeName: string;
  payeeBank?: string | null;
  payeeAccount?: string | null;
  method: "bank_transfer" | "wechat" | "alipay" | "cash";
  paidAmount: number;
  paidAt?: string;
  paidBy: string;
  evidenceImages: string[];
  remark?: string | null;
}) {
  if (!params.payeeName.trim()) {
    throw new Error("收款人不能为空");
  }

  if (!params.evidenceImages.length) {
    throw new Error("请至少上传一张打款凭证");
  }

  if (!params.paidBy) {
    throw new Error("请选择打款登记人");
  }

  if (Number(params.paidAmount.toFixed(2)) !== Number(params.totalAmount.toFixed(2))) {
    throw new Error("打款金额必须等于费用申请总金额");
  }

  const result = await expenseRequestApi.pay(params.id, {
    payee_name: params.payeeName,
    payee_bank: params.payeeBank ?? null,
    payee_account: params.payeeAccount ?? null,
    method: params.method,
    paid_amount: params.paidAmount,
    paid_at: params.paidAt,
    paid_by: params.paidBy,
    evidence_images: params.evidenceImages,
    remark: params.remark ?? null,
  });

  return result.data;
}
```

---

## 12. 列表页筛选示例

```ts
async function loadMyExpenseRequests(employeeId: string) {
  const result = await expenseRequestApi.list({
    page: 1,
    pageSize: 20,
    employee_id: employeeId,
  });

  return result.data;
}

async function loadPendingExpenseRequests() {
  const result = await expenseRequestApi.list({
    page: 1,
    pageSize: 20,
    status: "pending",
  });

  return result.data;
}
```

---

## 13. 展示格式化建议

```ts
export function formatExpenseMode(mode?: ExpenseRequestRecord["mode"] | null) {
  switch (mode) {
    case "reimbursement":
      return "员工报销";
    case "advance":
      return "预借款";
    case "direct":
      return "公司直付";
    case "petty_cash":
      return "备用金";
    default:
      return "-";
  }
}

export function formatExpenseStatus(status?: ExpenseRequestRecord["status"] | null) {
  switch (status) {
    case "draft":
      return "草稿";
    case "pending":
      return "审批中";
    case "approved":
      return "待打款";
    case "rejected":
      return "已驳回";
    case "paid":
      return "已完成";
    case "cancelled":
      return "已撤回";
    default:
      return "-";
  }
}

export function formatExpenseStep(
  step?: ExpenseRequestRecord["current_step"] | null,
) {
  switch (step) {
    case "draft":
      return "草稿";
    case "manager_review":
      return "主管审核";
    case "finance_review":
      return "财务审核";
    case "payment":
      return "待打款";
    case "done":
      return "已完成";
    case "cancelled":
      return "已作废";
    default:
      return "-";
  }
}

export function formatMoney(amount?: number | null) {
  if (amount == null) return "-";
  return amount.toFixed(2);
}
```

---

## 14. 最容易写错的点

- 在 `pending` 状态下继续允许编辑
- 以为第一次 `approve` 就会直接变成 `approved`
- 明细保存用局部 patch，而不是整单替换
- 提交时没有先校验至少一条明细
- 支付时 `paid_amount` 和 `total_amount` 不一致
- 支付时没传 `paid_by`
- 支付时没传至少一张凭证

---

## 15. 最小可直接照抄的页面骨架

```ts
async function initExpenseRequestPage(id: string) {
  setPageState({ kind: "loading" });

  try {
    const record = await loadExpenseRequestDetail(id);
    setPageState({ kind: "ready", record });
  } catch (error) {
    toast.error(getErrorMessage(error));
  }
}
```

配合下面这组动作就够了：

- `createExpenseDraft`
- `saveExpenseDraft`
- `submitExpenseRequest`
- `approveExpenseRequest`
- `rejectExpenseRequest`
- `payExpenseRequest`

前端如果先把这 6 个动作落好，费用申请这条链路就能联调。

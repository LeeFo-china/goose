# 项目介绍费前端请求封装与页面状态示例

本文档是对 [2026-04-19-frontend-project-referrals-integration-summary.md](/Users/leefo/Public/work/gooes/docs/2026-04-19-frontend-project-referrals-integration-summary.md:1) 的补充。

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

export type ExternalReferrerItem = {
  id: string;
  name: string;
  phone: string | null;
  bank_name: string | null;
  bank_account: string | null;
  wechat_account: string | null;
  alipay_account: string | null;
  status: "active" | "inactive";
  remark: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectReferralItem = {
  id: string;
  project_id: string;
  referrer_id: string;
  rate_bps: number;
  base_amount: number | null;
  commission_amount: number | null;
  status: "pending" | "calculated" | "paid" | "cancelled";
  calculated_at: string | null;
  recalculated_at: string | null;
  paid_at: string | null;
  paid_evidence_images: string[];
  paid_remark: string | null;
  paid_by: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
  project: {
    id: string;
    name: string | null;
    status: string | null;
    signed_amount: number | null;
    customer_id: string | null;
  } | null;
  referrer: {
    id: string;
    name: string;
    phone: string | null;
    status: "active" | "inactive";
  } | null;
  paid_operator: {
    id: string;
    name: string | null;
    phone: string | null;
  } | null;
};

export type ProjectReferralByProjectResponse =
  ApiSuccess<ProjectReferralItem | null>;
```

---

## 2. 建议前端统一用一个 `request` 包装

下面只是最小示例，你们如果已经有 `axios` / `fetcher` / `umi-request`，直接把返回类型和错误处理套进去就行。

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

如果你们有统一错误码处理，建议把后端返回的 `message` 原样透出给表单提示。

---

## 3. 项目介绍费相关 API 封装

```ts
export const projectReferralApi = {
  getByProjectId(projectId: string) {
    return request<ProjectReferralByProjectResponse>(
      `/project-referrals/project?project_id=${projectId}`,
    );
  },

  getById(id: string) {
    return request<ApiSuccess<ProjectReferralItem>>(`/project-referrals/${id}`);
  },

  list(params: {
    page?: number;
    pageSize?: number;
    status?: "pending" | "calculated" | "paid" | "cancelled";
    project_id?: string;
  }) {
    const search = new URLSearchParams();

    if (params.page) search.set("page", String(params.page));
    if (params.pageSize) search.set("pageSize", String(params.pageSize));
    if (params.status) search.set("status", params.status);
    if (params.project_id) search.set("project_id", params.project_id);

    return request<ApiSuccess<PagedData<ProjectReferralItem>>>(
      `/project-referrals?${search.toString()}`,
    );
  },

  create(payload: {
    project_id: string;
    referrer_id: string;
    rate_bps: number;
    remark?: string | null;
  }) {
    return request<ApiSuccess<ProjectReferralItem>>("/project-referrals", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(
    id: string,
    payload: {
      referrer_id?: string;
      rate_bps?: number;
      remark?: string | null;
    },
  ) {
    return request<ApiSuccess<ProjectReferralItem>>(`/project-referrals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  markPaid(
    id: string,
    payload: {
      paid_at?: string;
      paid_evidence_images: string[];
      paid_remark?: string | null;
      paid_by: string;
    },
  ) {
    return request<ApiSuccess<ProjectReferralItem>>(
      `/project-referrals/${id}/pay`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },
};
```

---

## 4. 项目接口封装

项目介绍费联动里，前端最少要有这个项目更新方法：

```ts
export const projectApi = {
  update(
    id: string,
    payload: {
      status?: string | null;
      signed_amount?: number | null;
    },
  ) {
    return request<ApiSuccess<Record<string, unknown>>>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
};
```

如果当前项目编辑页已经有完整的项目更新 API，就不用再单独建一个，只要保证签约场景会把 `signed_amount` 带上。

---

## 5. 外部介绍人接口封装

```ts
export const externalReferrerApi = {
  list(params?: { page?: number; pageSize?: number }) {
    const search = new URLSearchParams();

    if (params?.page) search.set("page", String(params.page));
    if (params?.pageSize) search.set("pageSize", String(params.pageSize));

    const query = search.toString();

    return request<ApiSuccess<PagedData<ExternalReferrerItem>>>(
      `/external-referrers${query ? `?${query}` : ""}`,
    );
  },

  create(payload: {
    name: string;
    phone?: string | null;
    bank_name?: string | null;
    bank_account?: string | null;
    wechat_account?: string | null;
    alipay_account?: string | null;
    status?: "active" | "inactive";
    remark?: string | null;
  }) {
    return request<ApiSuccess<ExternalReferrerItem>>("/external-referrers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
```

---

## 6. 页面初始化推荐写法

项目编辑页最少要有这两个请求：

1. 项目详情
2. 当前项目对应的介绍费详情

示例：

```ts
async function loadProjectReferralCard(projectId: string) {
  const result = await projectReferralApi.getByProjectId(projectId);
  return result.data;
}
```

注意这里的返回值是：

- `ProjectReferralItem`
- 或 `null`

`null` 不是异常，表示当前项目还没有介绍费配置。

前端页面不要把这个状态当成错误页。

---

## 7. 前端页面状态建议

建议不要只用一个 `loading` 布尔值乱控按钮，至少把介绍费卡片状态拆成下面几类：

```ts
type ReferralCardState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "ready"; referral: ProjectReferralItem };
```

建议状态切换规则：

- 初始化请求中：`loading`
- 请求成功但 `data === null`：`empty`
- 请求成功且有记录：`ready`

这样页面逻辑会非常清楚。

---

## 8. 按钮和字段只读规则

前端建议统一用派生状态控制：

```ts
function getReferralPermissions(referral: ProjectReferralItem | null) {
  const isPaid = referral?.status === "paid";
  const canEditReferral = !!referral && !isPaid;
  const canMarkPaid = referral?.status === "calculated";

  return {
    isPaid,
    canEditReferral,
    canMarkPaid,
    signedAmountReadonly: isPaid,
    referrerReadonly: isPaid,
    rateReadonly: isPaid,
  };
}
```

页面里按这个结果控：

- `signedAmountReadonly`
- `referrerReadonly`
- `rateReadonly`
- `canMarkPaid`

不要把这些判断散落在多个组件里。

---

## 9. 项目签约提交流程示例

这是最关键的一段。

```ts
async function submitProjectSign(params: {
  projectId: string;
  signedAmount: number;
}) {
  if (!params.signedAmount || params.signedAmount <= 0) {
    throw new Error("签约金额必须大于 0");
  }

  await projectApi.update(params.projectId, {
    status: "signed",
    signed_amount: params.signedAmount,
  });

  const referralResult = await projectReferralApi.getByProjectId(params.projectId);

  return referralResult.data;
}
```

页面处理建议：

```ts
async function onConfirmSign() {
  try {
    setSubmitting(true);

    const referral = await submitProjectSign({
      projectId,
      signedAmount: formValues.signed_amount,
    });

    setReferralCardState(
      referral
        ? { kind: "ready", referral }
        : { kind: "empty" },
    );

    toast.success("项目签约成功");
  } catch (error) {
    toast.error(getErrorMessage(error));
  } finally {
    setSubmitting(false);
  }
}
```

重点：

- 项目签约成功后一定要重新拉一次介绍费详情
- 不要本地手算 `commission_amount`

---

## 10. 首次配置介绍费流程示例

```ts
async function createProjectReferral(params: {
  projectId: string;
  referrerId: string;
  rateBps: number;
  remark?: string | null;
}) {
  if (!params.referrerId) {
    throw new Error("请选择介绍人");
  }

  if (!Number.isInteger(params.rateBps)) {
    throw new Error("提成比例必须是整数基点");
  }

  if (params.rateBps < 100 || params.rateBps > 400) {
    throw new Error("提成比例必须在 100 到 400 之间");
  }

  await projectReferralApi.create({
    project_id: params.projectId,
    referrer_id: params.referrerId,
    rate_bps: params.rateBps,
    remark: params.remark ?? null,
  });

  const result = await projectReferralApi.getByProjectId(params.projectId);
  return result.data;
}
```

如果项目已经签约，这里刷新回来通常就是 `calculated`。  
如果项目还没签约，刷新回来通常是 `pending`。

---

## 11. 修改介绍人或比例流程示例

```ts
async function updateProjectReferral(params: {
  referralId: string;
  projectId: string;
  referrerId?: string;
  rateBps?: number;
  remark?: string | null;
}) {
  await projectReferralApi.update(params.referralId, {
    referrer_id: params.referrerId,
    rate_bps: params.rateBps,
    remark: params.remark,
  });

  const result = await projectReferralApi.getByProjectId(params.projectId);
  return result.data;
}
```

页面提交前建议先拦一次：

```ts
if (referral?.status === "paid") {
  throw new Error("已支付介绍费不可修改");
}
```

虽然前端应当已经禁用，但这里最好再守一次。

---

## 12. 标记已支付流程示例

```ts
async function submitReferralPaid(params: {
  referralId: string;
  projectId: string;
  paidAt?: string;
  paidEvidenceImages: string[];
  paidRemark?: string | null;
  paidBy: string;
}) {
  if (!params.paidEvidenceImages.length) {
    throw new Error("请至少上传一张支付凭证");
  }

  if (!params.paidBy) {
    throw new Error("请选择支付登记人");
  }

  await projectReferralApi.markPaid(params.referralId, {
    paid_at: params.paidAt,
    paid_evidence_images: params.paidEvidenceImages,
    paid_remark: params.paidRemark ?? null,
    paid_by: params.paidBy,
  });

  const result = await projectReferralApi.getByProjectId(params.projectId);
  return result.data;
}
```

支付成功后，前端立即做这几个动作：

- 关闭支付弹窗
- 刷新介绍费详情
- 把 `signed_amount / referrer_id / rate_bps` 切只读

---

## 13. 页面渲染建议

### 13.1 没有介绍费配置

显示：

- “暂未配置介绍费”
- “去配置”按钮

不要显示报错态。

### 13.2 `pending`

显示：

- 已选介绍人
- 当前比例
- 状态标签 `待计算`

按钮：

- 可以编辑介绍人
- 可以编辑比例
- 不显示“标记已支付”

### 13.3 `calculated`

显示：

- 介绍人
- 比例
- 签约金额
- 介绍费金额
- 计算时间

按钮：

- 可以编辑介绍人
- 可以编辑比例
- 可以点“标记已支付”

### 13.4 `paid`

显示：

- 介绍人
- 比例
- 签约金额
- 介绍费金额
- 支付时间
- 支付登记人
- 支付备注
- 支付凭证

按钮：

- 全部只读
- 不再显示可编辑按钮
- 不再显示“标记已支付”

---

## 14. 常用派生函数建议

```ts
export function formatRateBps(rateBps?: number | null) {
  if (rateBps == null) return "-";
  return `${rateBps / 100}%`;
}

export function formatMoney(amount?: number | null) {
  if (amount == null) return "-";
  return amount.toFixed(2);
}

export function getReferralStatusLabel(
  status?: ProjectReferralItem["status"] | null,
) {
  switch (status) {
    case "pending":
      return "待计算";
    case "calculated":
      return "待支付";
    case "paid":
      return "已支付";
    case "cancelled":
      return "已作废";
    default:
      return "-";
  }
}
```

---

## 15. 前端最容易写错的点

- 把 `rate_bps=150` 传成 `1.5`
- 把 `GET /project-referrals/project` 的 `data: null` 当异常
- 项目签约成功后没有重新拉介绍费详情
- 前端自己算 `commission_amount`
- `paid` 后仍然允许改比例、介绍人、签约金额
- 支付时没传 `paid_by`
- 支付时没校验至少一张凭证

---

## 16. 最小可直接照抄的页面骨架

```ts
async function initProjectReferralModule(projectId: string) {
  setReferralCardState({ kind: "loading" });

  try {
    const result = await projectReferralApi.getByProjectId(projectId);
    const referral = result.data;

    setReferralCardState(
      referral
        ? { kind: "ready", referral }
        : { kind: "empty" },
    );
  } catch (error) {
    toast.error(getErrorMessage(error));
  }
}
```

配合下面这组动作就够了：

- `initProjectReferralModule`
- `onConfirmSign`
- `createProjectReferral`
- `updateProjectReferral`
- `submitReferralPaid`

前端如果先把这 5 个动作落好，联调基本不会偏。

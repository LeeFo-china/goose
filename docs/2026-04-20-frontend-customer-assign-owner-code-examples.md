# 客户负责人分配前端代码示例

本文档是对 [2026-04-20-frontend-customer-assign-owner-summary.md](/Users/leefo/Public/work/gooes/docs/2026-04-20-frontend-customer-assign-owner-summary.md:1) 的补充。

目标不是解释权限模型，而是给前端直接可抄的代码结构。

---

## 1. 建议前端统一使用的类型

```ts
export type AccessScope = 'self' | 'department' | 'assigned' | 'all';

export type PermissionItem = {
  code: string;
  scope: AccessScope;
};

export type AuthPermissionContext = {
  authUserId: string;
  employeeId: string | null;
  systemRole: string | null;
  employeeStatus: string | null;
  departmentId: string | null;
  postId: string | null;
  roleCodes: string[];
  permissions: PermissionItem[];
};

export type EmployeeLite = {
  id: string;
  name: string | null;
  phone?: string | null;
  avatar?: string | null;
};

export type CustomerRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  owner_id: string | null;
  owner_name: string | null;
  owner?: EmployeeLite | null;
};
```

---

## 2. 请求封装示例

```ts
import request from '@/utils/request';

export const permissionApi = {
  getMyPermissions() {
    return request.get<{ data: AuthPermissionContext }>('/auth/me/permissions');
  },
};

export const customerApi = {
  getDetail(id: string) {
    return request.get<{ data: CustomerRecord }>(`/customers/${id}/detail`);
  },

  assignOwner(id: string, ownerId: string) {
    return request.patch<{ data: CustomerRecord }>(`/customers/${id}`, {
      owner_id: ownerId,
    });
  },
};

export const employeeApi = {
  list(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
  }) {
    return request.get('/employees', { params });
  },
};
```

注意：

- 分配负责人继续走 `PATCH /customers/:id`
- 不要自己拼 `PUT`
- 请求体只传 `owner_id` 就够

---

## 3. 权限工具函数

建议前端统一封装，不要每个页面自己写一遍。

```ts
export function findPermission(
  permissions: PermissionItem[] | undefined,
  code: string,
) {
  return permissions?.find((item) => item.code === code) ?? null;
}

export function hasPermission(
  permissions: PermissionItem[] | undefined,
  code: string,
) {
  return Boolean(findPermission(permissions, code));
}

export function getPermissionScope(
  permissions: PermissionItem[] | undefined,
  code: string,
) {
  return findPermission(permissions, code)?.scope ?? null;
}

export function canShowAssignOwnerButton(
  permissions: PermissionItem[] | undefined,
) {
  return hasPermission(permissions, 'customer.assign_owner');
}

export function canShowEditCustomerButton(
  permissions: PermissionItem[] | undefined,
) {
  return hasPermission(permissions, 'customer.update');
}
```

这里最重要的是：

- `customer.assign_owner` 和 `customer.update` 分开判断
- 不要因为能编辑客户资料，就默认能分配负责人

---

## 4. 页面初始化示例

```ts
async function loadCustomerDetailPage(customerId: string) {
  const [permissionRes, customerRes] = await Promise.all([
    permissionApi.getMyPermissions(),
    customerApi.getDetail(customerId),
  ]);

  return {
    permissionContext: permissionRes.data,
    customer: customerRes.data,
  };
}
```

页面 state 建议至少有：

```ts
type PageState = {
  loading: boolean;
  permissionContext: AuthPermissionContext | null;
  customer: CustomerRecord | null;
  assignDialogVisible: boolean;
  assigning: boolean;
};
```

---

## 5. 按钮显隐示例

### React / Taro 组件写法

```tsx
const assignPermission = findPermission(
  permissionContext?.permissions,
  'customer.assign_owner',
);

const canAssignOwner = Boolean(assignPermission);
const canEditCustomer = hasPermission(
  permissionContext?.permissions,
  'customer.update',
);

return (
  <>
    {canEditCustomer && (
      <Button onClick={handleEditCustomer}>
        编辑客户
      </Button>
    )}

    {canAssignOwner && (
      <Button type='primary' onClick={openAssignDialog}>
        分配员工
      </Button>
    )}
  </>
);
```

错误示例：

```tsx
const canAssignOwner = hasPermission(permissions, 'customer.update');
```

这个现在已经不对了。

---

## 6. 分配弹层的最小状态设计

```ts
type AssignDialogState = {
  visible: boolean;
  loading: boolean;
  submitting: boolean;
  keyword: string;
  selectedEmployeeId: string;
  employeeList: EmployeeLite[];
};
```

建议交互：

1. 打开弹层时拉员工列表
2. 支持按姓名 / 手机搜索
3. 选中员工后提交
4. 成功后用返回结果直接刷新客户负责人

---

## 7. 提交分配负责人示例

```ts
async function handleAssignOwner(customerId: string, selectedEmployeeId: string) {
  if (!selectedEmployeeId) {
    Taro.showToast({
      title: '请选择员工',
      icon: 'none',
    });
    return;
  }

  try {
    setAssigning(true);

    const res = await customerApi.assignOwner(customerId, selectedEmployeeId);
    const nextCustomer = res.data;

    setCustomer(nextCustomer);
    setAssignDialogVisible(false);

    Taro.showToast({
      title: '分配成功',
      icon: 'success',
    });
  } catch (error: any) {
    handleAssignOwnerError(error);
  } finally {
    setAssigning(false);
  }
}
```

---

## 8. 错误处理示例

建议对 `400 / 403` 单独收敛。

```ts
function handleAssignOwnerError(error: any) {
  const statusCode = error?.statusCode || error?.response?.status;
  const message =
    error?.message ||
    error?.response?.data?.message ||
    '分配失败';

  if (statusCode === 403) {
    Taro.showToast({
      title: message || '无权限分配客户负责人',
      icon: 'none',
    });
    return;
  }

  if (statusCode === 400) {
    Taro.showToast({
      title: message || '目标负责人不存在或不可用',
      icon: 'none',
    });
    return;
  }

  Taro.showToast({
    title: '分配失败，请稍后重试',
    icon: 'none',
  });
}
```

---

## 9. 成功后如何刷新页面

推荐直接使用响应里的客户对象，不要再额外查负责人详情。

因为当前后端已经回传：

- `owner_id`
- `owner`
- `owner_name`

所以成功后直接：

```ts
setCustomer(res.data);
```

页面展示建议优先顺序：

```ts
const ownerDisplayName =
  customer?.owner?.name ??
  customer?.owner_name ??
  '未分配';
```

---

## 10. Taro 页面片段示例

```tsx
<View className='customer-owner-card'>
  <View className='customer-owner-main'>
    <Text className='label'>负责人</Text>
    <Text className='value'>
      {customer?.owner?.name ?? customer?.owner_name ?? '未分配'}
    </Text>
  </View>

  {canShowAssignOwnerButton(permissionContext?.permissions) && (
    <Button
      size='mini'
      type='primary'
      loading={assigning}
      onClick={openAssignDialog}
    >
      分配员工
    </Button>
  )}
</View>
```

---

## 11. 前端最容易犯的 4 个错误

1. 用 `customer.update` 控制“分配员工”按钮  
   现在必须改成 `customer.assign_owner`

2. 分配成功后再去二次请求员工详情  
   现在直接用返回的 `owner / owner_name`

3. 把“能分配负责人”和“能编辑客户资料”绑定成一个权限  
   这两个已经拆开了

4. 只做按钮显隐，不处理提交时报错  
   后端仍然会做强校验，`403` 不能当成异常崩掉

---

## 12. 可直接复用的一句话逻辑

可以把这条写进前端实现备注里：

```ts
“分配员工”按钮只看 customer.assign_owner；
“编辑客户”按钮只看 customer.update；
这两个权限互不替代。
```

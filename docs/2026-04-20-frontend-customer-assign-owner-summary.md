# 客户负责人分配前端对接摘要

本文档只面向前端联调。

以当前后端已经落地并完成真实验证的实现为准，不要再按旧的 `customer.update` 口径理解“分配员工”。

对应后端执行方案见：
[2026-04-20-customer-assign-owner-permission-summary.md](/Users/leefo/Public/work/gooes/docs/2026-04-20-customer-assign-owner-permission-summary.md:1)

如果前端需要直接照抄的请求封装和页面逻辑，再看：
[2026-04-20-frontend-customer-assign-owner-code-examples.md](/Users/leefo/Public/work/gooes/docs/2026-04-20-frontend-customer-assign-owner-code-examples.md:1)

---

## 1. 这次前端必须知道的变化

“客户详情页分配员工”现在是独立权限，不再等同于普通客户编辑。

新增权限码：

- `customer.assign_owner`

这意味着：

- 有 `customer.update` 不代表能改负责人
- 有 `customer.assign_owner` 也不代表能改客户其他资料

前端必须按 `/auth/me/permissions` 返回的权限和 scope 做按钮显隐。

---

## 2. 前端要怎么判断是否显示“分配员工”按钮

前端登录后先查：

- `GET /auth/me/permissions`

从返回的 `data.permissions` 中查：

- `code = customer.assign_owner`

示例：

```json
{
  "data": {
    "employeeId": "emp_xxx",
    "permissions": [
      {
        "code": "customer.read",
        "scope": "department"
      },
      {
        "code": "customer.assign_owner",
        "scope": "department"
      }
    ]
  }
}
```

前端建议规则：

1. 没有 `customer.assign_owner`
   - 不显示按钮
2. 有 `customer.assign_owner`
   - 显示按钮
3. 前端不要自己做最终授权
   - 后端会再做强校验

---

## 3. 当前后端已经支持的 scope 语义

### `all`

- 可把任意客户分配给任意有效员工

### `department`

- 可查看本部门范围内的客户
- 可把负责人改给本部门有效员工
- 改给外部门员工会被拒绝

### `self`

- 只能把负责人改成自己

前端不需要自己复刻这些范围判断。

只需要：

- 用权限码控制入口显隐
- 在提交失败时正确提示后端返回的错误

---

## 4. 当前哪些角色已经可用

当前已明确落地的模板：

1. `system_admin`
   - `customer.assign_owner = all`
2. `design_manage`
   - `customer.read = department`
   - `customer.assign_owner = department`

如果某个账号前端没有拿到这条权限，不是前端问题，优先让后端查该员工的角色模板和权限覆盖。

---

## 5. 前端应该调哪个接口

继续使用现有接口：

- `PATCH /customers/:id`

请求体示例：

```json
{
  "owner_id": "target_employee_id"
}
```

注意：

- 这不是新接口
- 但现在 `owner_id` 变更会触发独立权限校验

---

## 6. 成功和失败的真实语义

### 成功

成功后，返回的客户对象里仍然会带：

- `owner_id`
- `owner`
- `owner_name`

所以前端分配成功后，可以直接用响应刷新负责人显示，不需要再额外请求一次员工详情。

### 常见失败

#### 1. 无 `customer.assign_owner`

后端会返回：

- `403`

前端建议提示：

- `无权限分配客户负责人`

#### 2. 目标员工不在允许范围

例如部门主管把客户改给外部门员工：

- `403`

前端建议提示：

- `目标员工不在你的可分配范围内`

#### 3. 目标员工不存在或不可用

- `400`

前端建议提示：

- `目标负责人不存在或不可用`

---

## 7. 这次前端不要再做的事

### 不要再按 `customer.update` 判断“分配员工”按钮

现在这条能力已经拆开了。

错误做法：

- 有 `customer.update` 就显示“分配员工”

正确做法：

- 只看 `customer.assign_owner`

### 不要把“能分配负责人”理解成“能编辑客户资料”

真实后端规则是：

- `customer.assign_owner` 不会自动放开 `customer.update`

也就是说：

- 可能能分配负责人
- 但不能改客户姓名、电话、状态

前端不要把这两个入口合并成一个总开关。

### 不要再自己二次查负责人姓名

当前客户接口已经返回：

- `owner`
- `owner_name`

优先直接读返回结构。

---

## 8. 推荐前端实现顺序

### 1. 页面初始化

进入客户详情页后：

1. 查客户详情
2. 查 `/auth/me/permissions`
3. 根据是否存在 `customer.assign_owner` 决定是否显示“分配员工”

### 2. 打开分配弹层

建议继续复用员工选择器。

前端选择员工后，提交：

```json
{
  "owner_id": "选中的员工ID"
}
```

### 3. 提交成功后

直接用返回结果刷新：

- 负责人姓名
- 负责人 ID

### 4. 提交失败后

根据返回状态处理：

- `403`：权限或范围不允许
- `400`：目标员工无效

---

## 9. 前端联调自检清单

联调前至少确认这几项：

1. `/auth/me/permissions` 已能拿到 `customer.assign_owner`
2. “分配员工”按钮只按 `customer.assign_owner` 显示
3. `PATCH /customers/:id` 请求体只传 `owner_id`
4. 成功后直接使用响应里的 `owner` / `owner_name`
5. `403` 和 `400` 已有明确提示
6. 不再把“分配负责人”和“编辑客户资料”绑定成同一权限入口

---

## 10. 如果前端使用 `@gooes/domain`

前端如果依赖 `@gooes/domain`，需要升级到新版本：

- `1.4.0`

包文件：

- [gooes-domain-1.4.0.tgz](/Users/leefo/Public/work/gooes/packages/domain/gooes-domain-1.4.0.tgz:1)

这次和前端直接相关的是：

- `PERMISSION_CODE_VALUES` 已包含 `customer.assign_owner`
- 运行时权限配置已同步更新

---

## 11. 一句话同步给前端

可以直接这样发：

```text
客户详情页“分配员工”现在要按独立权限 customer.assign_owner 对接，不再复用 customer.update。

前端先查 /auth/me/permissions，有 customer.assign_owner 才显示按钮；提交时继续走 PATCH /customers/:id，只传 owner_id。

成功后直接用返回的 owner / owner_name 刷新页面；403 代表没权限或超范围，400 代表目标负责人无效。
```

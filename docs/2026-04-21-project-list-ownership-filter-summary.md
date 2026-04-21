# 项目列表“我的项目 / 全部项目”最小可行方案

## 目标

在项目列表页增加一层“归属过滤”，让员工能快速查看：

- 我的项目
- 全部项目

同时不破坏现有：

- 状态筛选
- 搜索
- 分页
- 权限控制

## 最小可行产品方案

### 1. 过滤分层

项目列表页筛选拆成两层：

- 第一层：归属范围
  - `我的项目`
  - `全部项目`
- 第二层：项目状态
  - `全部 / 量房中 / 已签约 / 施工中 / 已完工 ...`

搜索始终作用在：

- 当前归属范围
- 当前状态

之内。

### 2. 不同权限下的页面行为

#### 普通员工：`project.read = self`

- 页面默认只看 `我的项目`
- 不显示 `全部项目`
- 可以直接把归属切换隐藏，或显示成只读标签 `我的项目`

#### 有更大范围权限的员工：`project.read = department / all`

- 显示归属切换
- 可在：
  - `我的项目`
  - `全部项目`
  之间切换

### 3. 当前“我的项目”最小口径

当前先按现有项目字段做最小可用定义：

- 当前员工 `employeeId === project.designer_id`
  或
- 当前员工 `employeeId === project.supervisor_id`

后续如果后端增加：

- `project_members`
- `project_manager_id`
- `worker_ids`

再扩展“我的项目 = 我参与的项目”。

## 为什么建议后端配合

前端如果自己拉“全部项目”再本地过滤“我的项目”，会有 4 个问题：

1. 分页不准确
2. `total / totalPages` 不准确
3. 搜索结果不准确
4. 权限范围容易和后端冲突

所以“我的项目 / 全部项目”这层，建议由后端直接支持查询参数。

## 后端最小对接要求

建议在现有项目列表接口上新增一个查询参数，不需要新开接口。

### 推荐接口

```http
GET /projects
GET /projects/status
```

如果当前首页和列表页分别走：

- `/projects`
- `/projects/status`

则建议两条都支持同一套归属参数。

### 推荐查询参数

```http
ownership=self
ownership=all
```

完整示例：

```http
GET /projects/status?page=1&pageSize=10&ownership=self
GET /projects/status?page=1&pageSize=10&ownership=self&status=constructing
GET /projects/status?page=1&pageSize=10&ownership=all&status=signed&keyword=橙城
```

## 后端行为约定

### 1. `ownership=self`

返回当前员工“属于自己”的项目。

当前最小口径建议统一为：

```text
project.designer_id = currentEmployeeId
或
project.supervisor_id = currentEmployeeId
```

### 2. `ownership=all`

返回当前权限范围内的全部项目。

- `project.read = all`：全部项目
- `project.read = department`：本部门可见项目
- `project.read = self`：即使传 `ownership=all`，也不应越权返回全部

也就是说，`ownership=all` 仍然不能绕过权限范围。

## 权限建议

### 前端

- `project.read=self`
  - 默认只显示 `我的项目`
- `project.read=department/all`
  - 才显示 `全部项目`

### 后端

- 仍以 `project.read` 为最终数据范围依据
- `ownership` 只是前端选择的子过滤条件
- 不允许通过前端参数突破后端权限

## 前端最小实现建议

### 第一阶段

项目列表页新增归属过滤状态：

- `ownership = self | all`

规则：

- 普通员工默认 `self`
- 没有更大范围权限时，不显示切换

请求时把 `ownership` 透传给项目列表接口。

### 第二阶段

首页项目工作区也跟进支持同样的归属逻辑：

- 普通员工首页项目摘要默认就是 `我的项目`
- 有更大范围权限时，可再考虑补“我的 / 全部”切换

## 推荐返回结构

无需改现有分页结构，只需要保证在不同 `ownership` 下：

- `list` 正确
- `pagination.total` 正确
- `pagination.totalPages` 正确

例如：

```json
{
  "data": {
    "list": [],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 3,
      "totalPages": 1
    }
  },
  "message": "success"
}
```

## 验收标准

### case 1：普通员工

前提：

- `project.read = self`

预期：

- 页面只显示 `我的项目`
- 返回的数据只包含自己负责/参与的项目
- 看不到“全部项目”

### case 2：主管/管理员

前提：

- `project.read = department` 或 `all`

预期：

- 页面可切换 `我的项目 / 全部项目`
- `我的项目` 只看本人
- `全部项目` 看权限范围内全部项目

### case 3：状态 + 搜索组合

前提：

- `ownership=self`
- `status=constructing`
- `keyword=橙城`

预期：

- 返回结果同时满足：
  - 属于我
  - 状态是施工中
  - 关键词匹配

## 一句话结论

最小可行方案不是前端自己本地算“我的项目”，而是：

1. 前端新增一层 `ownership`
2. 后端在项目列表接口支持 `ownership=self/all`
3. 后端继续用 `project.read` 做最终权限范围控制

这样实现最稳，改动也最小。

---

## 当前后端状态

这份对接已经落到后端。

当前这两条接口都已支持：

- `GET /projects`
- `GET /projects/status`

新增查询参数：

- `ownership=self`
- `ownership=all`

### 当前实现口径

#### 1. `ownership=self`

当前统一按最小成员口径过滤：

- `projects.designer_id = currentEmployeeId`
  或
- `projects.supervisor_id = currentEmployeeId`

#### 2. `ownership=all`

返回当前 `project.read` 权限范围内的全部项目。

- `project.read = all`
  - 返回全部项目
- `project.read = department`
  - 返回部门权限范围内项目
- `project.read = self`
  - 即使传 `ownership=all`，结果也仍然只会是自己项目

也就是说：

- `ownership` 只是权限范围内的子过滤
- 不能突破后端 `project.read`

### 当前接口组合规则

以下条件现在都会同时生效：

1. 先按 `project.read` 收口最终可见范围
2. 再按 `ownership` 做“我的 / 全部”子过滤
3. 再按 `status`
4. 再按 `keyword`
5. 最后分页

所以：

- `ownership=self&status=constructing&keyword=橙城`

会返回：

- 当前员工本人负责/参与
- 且状态为施工中
- 且关键词命中橙城

的那部分项目，并且 `total / totalPages` 都是过滤后的结果。

### 本次代码落点

- `schema/projects.ts`
  - `ProjectListQuerySchema` 新增 `ownership`
- `services/access-policy.ts`
  - 新增基于 `ownership` 解析项目可见 ID 的逻辑
- `controllers/projects/index.ts`
  - `/projects`
  - `/projects/status`
  - 都已接入 `ownership=self/all`

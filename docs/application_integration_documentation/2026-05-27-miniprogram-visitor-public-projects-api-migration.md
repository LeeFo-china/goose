# 小程序 Visitor 公开项目列表接口迁移对接文档

日期：2026-05-27

## 1. 目标

小程序 visitor 页公开项目展示列表统一改用：

```http
GET /front/projects
```

旧接口：

```http
GET /projects/frontend-visible
```

小程序端已完成新路径对接。后端已清除旧接口兼容层，旧路径不再作为公开项目列表接口受支持。

## 2. 环境

dev API：

```text
https://api-dev.goodcms.cn
```

生产 API：

```text
https://api.goodcms.cn
```

小程序开发版、体验版联调必须使用 dev API，不要把生产 token 用到 dev API，也不要把 dev token 用到生产 API。

## 3. 接口替换

### 3.1 旧调用

```http
GET /projects/frontend-visible
Authorization: Bearer <visitor/customer/employee token>
```

### 3.2 新调用

```http
GET /front/projects
Authorization: Bearer <visitor/customer/employee token>
```

### 3.3 替换要求

- visitor 首页项目列表只调用 `/front/projects`。
- 不再调用 `/projects/frontend-visible`。
- 项目详情继续使用 `/front/projects/:id`。
- 项目日志继续使用 `/front/projects/:id/logs`。

## 4. 调用时机

小程序必须先完成 `/auth`，进入 visitor 可用状态后再请求公开项目列表。

允许请求公开项目列表的状态：

- `/auth` 返回 `mode = platform_visitor`
- 或已有有效 visitor token
- 或已有有效 customer / employee token，且当前页面确实是 visitor/公开展示入口

不要在没有有效 token 时直接请求 `/front/projects`。无效 token 会返回 401，例如：

```json
{
  "success": false,
  "message": "登录状态无效，请重新登录",
  "code": "TOKEN_INVALID"
}
```

## 5. 响应结构

`/front/projects` 与旧 `/projects/frontend-visible` 返回结构保持一致。

示例：

```json
{
  "data": [
    {
      "id": "project-id",
      "name": "项目名称",
      "status": "constructing",
      "visibility_status": "public",
      "style_tags": [],
      "property": {
        "community": "小区名称",
        "area": 120
      }
    }
  ],
  "message": "success"
}
```

小程序端应继续按现有列表字段渲染，不需要为本次迁移调整 UI 数据结构。

## 6. 推荐请求封装

```ts
export async function fetchVisitorPublicProjects(token: string) {
  return request({
    url: "/front/projects",
    method: "GET",
    header: {
      Authorization: `Bearer ${token}`,
    },
  });
}
```

如果项目里存在以下路径常量或硬编码，需要统一替换：

```text
/projects/frontend-visible
```

替换为：

```text
/front/projects
```

## 7. 验收标准

小程序端落代码后，需要完成以下验收：

1. 清空本地登录态后重新进入小程序。
2. `/auth` 返回 visitor 后，visitor 首页能展示公开项目列表。
3. Network / 后端日志里只出现 `GET /front/projects`，不再出现 `GET /projects/frontend-visible`。
4. 点击项目卡片后，详情页仍请求 `GET /front/projects/:id`。
5. 详情页日志仍请求 `GET /front/projects/:id/logs`。
6. token 失效时，先重新 `/auth`，不要循环请求 `/front/projects`。

## 8. 后端兼容层状态

后端已删除 `/projects/frontend-visible`：

小程序端不要保留旧接口兜底逻辑。验收时如果后端日志里仍看到 `/projects/frontend-visible`，说明仍有旧代码或缓存包在请求旧路径，需要继续排查小程序端调用点。

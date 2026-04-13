# 前端调用摘要 - 装修问答接口

日期：2026-04-12

## 接口信息

- **接口**：`POST /ai/decoration-qa`
- **用途**：装修知识问答，多轮上下文问答
- **鉴权**：需要携带登录 Token

请求头：

```http
Authorization: Bearer <token>
Content-Type: application/json
```

---

## 请求体

```json
{
  "question": "全包和半包怎么选？",
  "history": [
    {
      "role": "user",
      "content": "装修预算怎么控制？"
    },
    {
      "role": "assistant",
      "content": "控制装修预算建议从以下几个方面入手：1. 明确总预算；2. 区分必做项与可选项；3. 控制材料升级范围。"
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `question` | `string` | 是 | 当前用户最新提问 |
| `history` | `Array` | 是 | 历史上下文，按时间顺序传递 |
| `history[].role` | `"user" \| "assistant"` | 是 | 对话角色 |
| `history[].content` | `string` | 是 | 对话内容 |

---

## 成功响应

```json
{
  "data": {
    "answer": "全包和半包的主要区别在于主材采购方不同...",
    "suggestions": [
      "半包需要自己买哪些材料？",
      "全包容易踩哪些坑？"
    ]
  },
  "message": "success",
  "statusCode": 200
}
```

### 前端取值方式

- `data.answer`：AI 回答正文
- `data.suggestions`：推荐追问列表，可能为空数组
- `message`：通常为 `success`

---

## 失败响应

```json
{
  "error": "Internal Server Error",
  "message": "AI 服务繁忙，请稍后再试",
  "statusCode": 500
}
```

### 前端处理建议

- 直接使用 `message` 做 Toast 提示
- 如果接口返回 401，沿用现有静默登录续签逻辑

---

## Taro 调用示例

```ts
const res = await request.post("/ai/decoration-qa", {
  question: "装修预算怎么控制？",
  history: [
    {
      role: "user",
      content: "装修预算怎么控制？",
    },
  ],
});

const answer = res.data.answer;
const suggestions = res.data.suggestions || [];
```

---

## 注意事项

1. 必须带登录 Token
2. `history` 建议按时间顺序传递
3. `suggestions` 可能为空，前端需兜底
4. 回答内容可能包含换行，建议保留格式展示

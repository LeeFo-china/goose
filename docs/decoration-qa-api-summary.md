# 装修知识问答 (Decoration QA) 接口对接文档

前端已完成装修知识问答页面的开发，现需要后端配合实现以下大模型问答接口。

## 接口基本信息

- **接口路径**: `POST /ai/decoration-qa`
- **功能描述**: 接收用户的装修问题及历史对话上下文，调用大模型生成回答，并可选地返回推荐的追问问题。
- **鉴权要求**: 需要校验 Token（前端会在请求头携带 `Authorization: Bearer <token>`）。

---

## 1. 请求格式 (Request)

前端调用 `DecorationQaService.ask` 时，会发送 JSON 格式的请求体。

### 请求体结构 (JSON)

```json
{
  "question": "string",
  "history": [
    {
      "role": "user" | "assistant",
      "content": "string"
    }
  ]
}
```

### 字段说明

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `question` | `string` | 是 | 用户当前输入的最新问题。例如："水电改造要注意什么？" |
| `history` | `Array<Object>` | 是 | 历史对话上下文数组，按时间顺序排列。用于让大模型理解多轮对话。 |
| `history[].role` | `string` | 是 | 消息发送者角色。枚举值：`user` (用户), `assistant` (AI 助手)。 |
| `history[].content` | `string` | 是 | 历史消息的具体文本内容。 |

### 请求示例

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

---

## 2. 响应格式 (Response)

后端处理完成后，需返回符合前端 `DecorationQaResponse` 接口定义的 JSON 数据。

### 成功响应结构 (JSON)

```json
{
  "data": {
    "answer": "string",
    "suggestions": ["string"]
  },
  "message": "string",
  "statusCode": 200
}
```

### 字段说明

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `data.answer` | `string` | 是 | AI 生成的回答正文。支持换行符 `\n`，前端会保留格式展示。 |
| `data.suggestions` | `Array<string>` | 否 | 推荐的追问问题列表。如果提供，前端会将其拼接在回答末尾展示给用户。 |
| `message` | `string` | 否 | 提示信息，通常为 "success"。 |

### 成功响应示例

```json
{
  "data": {
    "answer": "全包和半包的主要区别在于主材的采购方：\n\n1. **全包**：装修公司负责所有辅材、主材的采购及施工。省心省力，适合工作忙碌的业主。\n2. **半包**：装修公司负责辅材采购及施工，业主自行购买主材（如瓷砖、地板、洁具等）。性价比高，材料质量自己把控，适合有一定时间和精力的业主。",
    "suggestions": [
      "半包需要自己买哪些材料？",
      "全包容易踩哪些坑？"
    ]
  },
  "message": "success",
  "statusCode": 200
}
```

### 失败响应示例

如果大模型调用失败或发生其他错误，请返回非 2xx 的 HTTP 状态码（或在业务结构中标识错误），并提供明确的 `message`，前端会直接 Toast 提示给用户。

```json
{
  "error": "Internal Server Error",
  "message": "AI 服务繁忙，请稍后再试",
  "statusCode": 500
}
```

---

## 3. 后端开发建议 (Prompt Engineering)

为了保证回答质量，建议后端在调用大模型时，注入以下 **System Prompt (系统提示词)**：

```text
你是一个专业的家装顾问，隶属于“河南蜜居装饰有限公司”。
你的任务是解答用户关于装修预算、材料选择、工期安排、施工流程、家装避坑等问题。

回答要求：
1. 态度专业、热情、客观。
2. 语言简洁明了，尽量使用分点列表（1. 2. 3.）进行说明。
3. 不要夸大承诺，不要替代专业的结构安全判断。
4. 涉及承重墙拆改、复杂水电改造等高风险施工时，必须提醒用户“具体以现场专业评估为准”。
5. 每次回答结束时，可以根据当前话题，给出 1-2 个相关的延伸问题建议。
```

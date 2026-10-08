# 小程序工序完工后等待验收合同

## 接口与行为

员工继续调用 `POST /workflow-tasks/:taskId/complete`，使用现有员工 token、租户上下文、项目可见范围和工序完工权限。请求沿用 `{ "action": "complete_procedure", "output": {} }`；日志/图片要求不变。

需验收工序完工成功后，响应 `data.result` 增加可选 `awaitingAcceptance: true`，当前实例指针不变，当前任务仍为 pending。`data.result.completedNode` 沿用原有字段名，其运行记录此时仍为 running，不能仅凭字段名判断流程已推进。操作后重新读取项目详情及 `workflow_progress`，以服务端最新动作和状态渲染。

- 当前时间线 `status=current`；`attributes.procedure_completed=true`；`display.status_label` 为待验收或对应验收阶段。
- `actions` 返回 `create_acceptance` / `edit_acceptance` / `view_acceptance`，遵守 disabled、reason 和原有权限。
- 后续节点保持 upcoming，不能提前进行收款或下一道工序。
- `POST /project-acceptances/:id/customer-confirm` 继续使用现有客户身份及客户归属校验；客户实际确认后才推进。
- 通用完成返回 409 `WORKFLOW_ACCEPTANCE_REQUIRED`；未真实确认或记录不匹配返回 `WORKFLOW_ACCEPTANCE_NOT_CONFIRMED`；未完工返回 `WORKFLOW_PROCEDURE_NOT_COMPLETED`。展示服务端中文消息并刷新详情，不做本地乐观推进。
- 网络重试可重复完工/确认，数据库不会重复推进；并发旧节点请求可能先返回冲突，刷新后重试同步。历史水电补验收不推进当前木工。
- 本次未新增列表接口，现有分页参数保持不变。

## 只读核对的小程序模块

- `src/services/workflow_task.ts`：现有 complete 包装。
- `src/packageProjects/pages/detail/hooks/useProjectWorkflowActionSubmit.ts`：成功后已 refreshProjectAfterWrite，提示“项目流程已更新”。
- `src/packageProjects/pages/detail/utils/workflowTimeline.ts`：读取 display.status_label、attributes、actions。
- `src/packageProjects/pages/detail/utils/workflowStageAcceptance.ts`：已识别 create/edit/view acceptance 动作。
- `src/packageProjects/pages/detail/utils/workflowActionConfirm.ts`：现有完工确认文案可由小程序团队优化为“施工完工后进入验收，业主确认后再推进”。
- `src/services/project_acceptance.ts`：现有 customer-confirm 包装。

现有小程序已具备刷新、状态和验收动作识别链路，后端门禁不依赖小程序发版。小程序团队负责真机验收及上述文案优化；本次未修改 orange。

## 联调验收

1. 需验收水电完工后刷新，仍在水电，显示待验收，可发起/处理验收；后续收款/工序不可执行。
2. 提交、主管通过、客户提异议均不提前推进；实际客户确认后推进一次。
3. 重复点击、断网重试、旧页面通用完成不能跳过验收。
4. 免验收工序完工继续直接推进；免派工但需验收工序也能完工并进入验收。
5. 已到木工的历史项目补做水电验收，木工、收款记录和当前任务保持不变。

生产真实项目不可代用户确认验收来测试；完整操作链使用测试环境样例项目。

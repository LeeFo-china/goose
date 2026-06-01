import {
  PROJECT_LOG_STAGE_CONFIG,
  type CustomerProjectQaConstructionStageItem,
  type CustomerProjectQaContext,
  type ProjectConstructionStageStatus,
  PROJECT_STAGE_REMINDER_PROMPTS,
  PROJECT_STATUS_REMINDER_PROMPTS,
} from './shared';

export function formatCustomerProjectQaContext(context: CustomerProjectQaContext) {
  const currentStageCode =
    context.construction_stages?.current_stage?.stage_code ??
      context.recent_logs.find((item) => item.stage_code)?.stage_code ??
      null;
  const reminderPrompts = currentStageCode
    ? (PROJECT_STAGE_REMINDER_PROMPTS[currentStageCode] || [])
    : (context.status
      ? (PROJECT_STATUS_REMINDER_PROMPTS[context.status] || [])
      : []);
  const lines: string[] = [
    "以下是当前客户项目上下文，仅可基于这些已同步资料回答项目相关问题。",
    "如果上下文不足，请明确说明“根据当前已同步的项目资料，暂时无法确认更多细节”。",
    "不要虚构施工进度、团队成员、时间计划或未发生的项目节点。",
    "回答当前施工进度、下一步工序、是否能进入下一阶段时，必须优先使用“施工阶段状态机”，不要只根据最近日志推断。",
    "如果用户在询问当前项目相关问题，除直接回答外，请尽量结合当前施工进度或项目状态，自然补充 1-3 条温馨提醒事项。",
    "温馨提醒必须贴近当前阶段，不能脱离当前项目上下文泛泛而谈。",
    "",
    "当前客户项目上下文：",
    `- 客户名称：${context.customer_name || "未同步"}`,
    `- 项目名称：${context.project_name || "未同步"}`,
    `- 项目状态：${context.status_label || context.status || "未同步"}`,
    `- 项目地址：${context.address || "未同步"}`,
    `- 开工日期：${context.start_date || "未同步"}`,
    `- 风格标签：${
      context.style_tags.length ? context.style_tags.join("、") : "未同步"
    }`,
    `- 主案设计：${context.designer_name || "未同步"}`,
    `- 施工管理：${context.supervisor_name || "未同步"}`,
  ];

  if (context.property) {
    lines.push(
      `- 房产信息：${
        [
          context.property.community,
          context.property.building_info,
          context.property.layout,
          context.property.area ? `${context.property.area}㎡` : null,
        ].filter(Boolean).join("，") || "未同步"
      }`,
    );
  } else {
    lines.push("- 房产信息：未同步");
  }

  if (context.construction_stages) {
    const stages = context.construction_stages;
    lines.push(
      `- 当前施工工序：${
        formatConstructionStageBrief(stages.current_stage) || "未同步"
      }`,
      `- 下一步施工工序：${
        formatConstructionStageBrief(stages.next_stage) || "暂无下一步工序"
      }`,
      `- 必需工序是否全部完成：${
        stages.required_completed ? "是" : "否"
      }`,
    );

    if (stages.missing_required_stages.length > 0) {
      lines.push(
        `- 尚未完成的必需工序：${
          stages.missing_required_stages
            .map((item) => item.stage_label)
            .join("、")
        }`,
      );
    }

    lines.push("- 施工阶段状态机：");
    stages.stages.forEach((item, index) => {
      const parts = [
        `${item.stage_label}(${formatConstructionStageStatus(item.status)})`,
        item.is_required ? "必需工序" : "辅助/收尾工序",
        item.acceptance_status ? `验收状态：${item.acceptance_status}` : null,
        item.latest_log
          ? `最近记录：${
            [
              item.latest_log.created_at?.slice(0, 10) ?? null,
              item.latest_log.node_name,
              item.latest_log.content,
            ].filter(Boolean).join(" - ")
          }`
          : null,
        item.blocked_reason ? `阻塞原因：${item.blocked_reason}` : null,
      ].filter(Boolean);

      lines.push(`  ${index + 1}. ${parts.join("；")}`);
    });
  } else {
    lines.push("- 施工阶段状态机：未同步");
  }

  if (context.recent_logs.length > 0) {
    lines.push("- 最近施工日志：");
    context.recent_logs.forEach((item, index) => {
      const parts = [
        item.created_at ? item.created_at.slice(0, 10) : null,
        item.stage_label || item.stage_code,
        item.node_name,
        item.content,
      ].filter(Boolean);

      lines.push(`  ${index + 1}. ${parts.join(" - ")}`);
    });
  } else {
    lines.push("- 最近施工日志：当前没有已同步的施工日志");
  }

  if (reminderPrompts.length > 0) {
    lines.push("- 当前阶段温馨提醒参考：");
    reminderPrompts.forEach((item, index) => {
      lines.push(`  ${index + 1}. ${item}`);
    });
  } else {
    lines.push(
      "- 当前阶段温馨提醒参考：当前未同步到足够阶段信息，请谨慎提醒并说明依据有限",
    );
  }

  return lines.join("\n");
}

export function formatConstructionStageBrief(
  stage?: CustomerProjectQaConstructionStageItem | null,
) {
  if (!stage) {
    return "";
  }

  const parts = [
    stage.stage_label,
    formatConstructionStageStatus(stage.status),
    stage.blocked_reason ? `阻塞原因：${stage.blocked_reason}` : null,
  ].filter(Boolean);

  return parts.join("，");
}

export function formatConstructionStageStatus(status: ProjectConstructionStageStatus) {
  const statusMap: Record<ProjectConstructionStageStatus, string> = {
    locked: "未解锁",
    not_started: "未开始",
    in_progress: "施工中",
    pending_acceptance: "待验收",
    rework_required: "整改中",
    accepted: "已验收通过",
  };

  return statusMap[status] ?? status;
}

export function formatCustomerProjectSuggestionContext(
  context: CustomerProjectQaContext,
) {
  const latestLog = context.recent_logs[0];
  const currentStage = context.construction_stages?.current_stage;
  const nextStage = context.construction_stages?.next_stage;
  const parts = [
    context.status_label || context.status
      ? `项目阶段：${context.status_label || context.status}`
      : null,
    currentStage
      ? `当前工序：${formatConstructionStageBrief(currentStage)}`
      : null,
    nextStage ? `下一步工序：${formatConstructionStageBrief(nextStage)}` : null,
    context.construction_stages?.missing_required_stages.length
      ? `未完成工序：${
        context.construction_stages.missing_required_stages
          .map((item) => item.stage_label)
          .join("、")
      }`
      : null,
    context.property?.area ? `房屋面积：${context.property.area}㎡` : null,
    context.property?.layout ? `户型：${context.property.layout}` : null,
    context.style_tags.length ? `风格：${context.style_tags.join("、")}` : null,
    latestLog
      ? `最近施工节点：${
        [
          latestLog.stage_label,
          latestLog.node_name,
        ].filter(Boolean).join(" - ") || "未同步"
      }`
      : "最近施工节点：未同步",
    context.status === "acceptance" || latestLog?.stage_code === "completion"
      ? "当前可能临近验收"
      : null,
  ].filter(Boolean);

  return parts.length
    ? parts.join("\n")
    : "当前项目摘要：暂未同步足够项目资料。";
}

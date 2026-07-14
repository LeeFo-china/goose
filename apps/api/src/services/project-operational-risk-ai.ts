import type {
  ProjectOperationalRiskAiSummary,
  ProjectOperationalRiskDisplayItem,
} from "@gooes/domain";
import { ProjectOperationalRiskAiSummarySchema } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import type {
  ProjectOperationalRiskAiSummaryBody,
  ProjectOperationalRiskListQuery,
} from "@/schema/project-health";
import { aiGateway } from "@/services/ai-gateway";
import type { AiGatewayChatInput, AiGatewayChatResult } from "@/services/ai-gateway";
import type { AuthContext } from "@/services/authorization";
import { projectOperationalRiskService } from "@/services/project-operational-risks";

const AI_SUMMARY_SCENE_CODE = "project_operational_risk_summary";
const AI_SUMMARY_TIMEOUT_MS = 30000;
const AI_SUMMARY_TEMPERATURE = 0.2;
const AI_SUMMARY_PAGE_SIZE = 20;

const NO_RISK_SUMMARY: ProjectOperationalRiskAiSummary = {
  overview: "当前筛选范围内暂无项目运营风险。",
  priorities: [],
  cautions: [],
};

const SYSTEM_PROMPT = [
  "你是装修公司项目运营风险分析助手。",
  "只能基于用户提供的风险事实生成经营摘要。",
  "最多选择 5 个优先处理项，priority.risk_key 必须来自输入。",
  "不要承诺工期、赔付、验收结果，不要做责任归因。",
  "只返回 JSON，不要输出 Markdown 或解释文字。",
].join("\n");

type Evidence = ProjectOperationalRiskDisplayItem["evidence"];

type RiskServicePort = {
  listRisks(
    authContext: AuthContext,
    query: ProjectOperationalRiskListQuery,
  ): Promise<{
    data: {
      items: ProjectOperationalRiskDisplayItem[];
    };
  }>;
};

type AiGatewayPort = {
  chat(input: AiGatewayChatInput): Promise<Pick<AiGatewayChatResult, "content">>;
};

export type ProjectOperationalRiskAiServiceDependencies = {
  riskService?: RiskServicePort;
  aiGateway?: AiGatewayPort;
};

type PromptRisk = {
  risk_key: string;
  risk_type: ProjectOperationalRiskDisplayItem["risk_type"];
  severity: ProjectOperationalRiskDisplayItem["severity"];
  project_name: string;
  overdue_days: number | null;
  occurred_at: string | null;
  due_at: string | null;
  assignee_employee_name: string | null;
  evidence: Evidence;
};

const evidenceAllowlist = {
  workflow_task_overdue: ["task_title"],
  procedure_overdue: ["procedure_name", "stage_name", "planned_end_date"],
  missing_project_log: ["business_date", "last_log_at", "current_stage"],
  acceptance_rework: ["acceptance_title", "acceptance_type", "reject_source"],
  service_ticket: ["ticket_no", "priority", "unresolved_hours"],
} as const satisfies Record<
  ProjectOperationalRiskDisplayItem["risk_type"],
  readonly string[]
>;

function pickEvidence(item: ProjectOperationalRiskDisplayItem): Evidence {
  const allowedKeys = evidenceAllowlist[item.risk_type];
  return Object.fromEntries(
    allowedKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(item.evidence, key))
      .map((key) => [key, item.evidence[key] ?? null]),
  );
}

function toPromptRisk(item: ProjectOperationalRiskDisplayItem): PromptRisk {
  return {
    risk_key: item.risk_key,
    risk_type: item.risk_type,
    severity: item.severity,
    project_name: item.project_name,
    overdue_days: item.overdue_days,
    occurred_at: item.occurred_at,
    due_at: item.due_at,
    assignee_employee_name: item.assignee_employee_name,
    evidence: pickEvidence(item),
  };
}

function invalidAiResponse() {
  return Errors.business(
    502,
    "AI 经营摘要格式异常，请重试",
    "PROJECT_OPERATIONAL_RISK_AI_INVALID_RESPONSE",
  );
}

function parseAiSummary(
  content: string,
  allowedRiskKeys: ReadonlySet<string>,
): ProjectOperationalRiskAiSummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw invalidAiResponse();
  }

  const result = ProjectOperationalRiskAiSummarySchema.safeParse(parsed);
  if (!result.success) {
    throw invalidAiResponse();
  }

  const overview = result.data.overview.trim();
  const hasUnknownRiskKey = result.data.priorities.some(
    (item) => !allowedRiskKeys.has(item.risk_key),
  );
  const hasBlankPriorityText = result.data.priorities.some(
    (item) =>
      !item.reason.trim() || !item.recommended_action.trim(),
  );
  const hasBlankCaution = result.data.cautions.some((item) => !item.trim());

  if (!overview || hasUnknownRiskKey || hasBlankPriorityText || hasBlankCaution) {
    throw invalidAiResponse();
  }

  return {
    overview,
    priorities: result.data.priorities.map((item) => ({
      risk_key: item.risk_key.trim(),
      reason: item.reason.trim(),
      recommended_action: item.recommended_action.trim(),
    })),
    cautions: result.data.cautions.map((item) => item.trim()),
  };
}

function buildUserPrompt(risks: PromptRisk[]): string {
  return JSON.stringify({
    instruction: "基于 risks 生成装修公司项目运营风险经营摘要。",
    output_schema: {
      overview: "不超过 800 字的一段整体判断",
      priorities: [
        {
          risk_key: "必须来自输入 risks[].risk_key",
          reason: "选择该风险优先处理的事实原因",
          recommended_action: "给运营/项目负责人的下一步动作",
        },
      ],
      cautions: ["需要提醒管理层避免误判或过度承诺的事项"],
    },
    risks,
  });
}

export class ProjectOperationalRiskAiService {
  private readonly riskService: RiskServicePort;
  private readonly aiGateway: AiGatewayPort;

  constructor(dependencies: ProjectOperationalRiskAiServiceDependencies = {}) {
    this.riskService = dependencies.riskService ?? projectOperationalRiskService;
    this.aiGateway = dependencies.aiGateway ?? aiGateway;
  }

  async generate(
    authContext: AuthContext,
    body: ProjectOperationalRiskAiSummaryBody,
  ): Promise<ProjectOperationalRiskAiSummary> {
    const query = {
      ...body,
      page: 1,
      pageSize: AI_SUMMARY_PAGE_SIZE,
    };
    const result = await this.riskService.listRisks(authContext, query);
    const promptRisks = result.data.items.map(toPromptRisk);

    if (promptRisks.length === 0) {
      return NO_RISK_SUMMARY;
    }

    const aiResult = await this.aiGateway.chat({
      sceneCode: AI_SUMMARY_SCENE_CODE,
      tenantId: authContext.tenantId,
      source: "admin",
      billable: true,
      temperature: AI_SUMMARY_TEMPERATURE,
      responseFormat: "json_object",
      timeoutMs: AI_SUMMARY_TIMEOUT_MS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(promptRisks) },
      ],
      metadata: {
        employee_id: authContext.employeeId,
        risk_count: promptRisks.length,
        risk_type: body.risk_type ?? null,
        severity: body.severity ?? null,
        has_keyword: Boolean(body.keyword),
      },
    });

    return parseAiSummary(
      aiResult.content,
      new Set(promptRisks.map((item) => item.risk_key)),
    );
  }
}

export const projectOperationalRiskAiService =
  new ProjectOperationalRiskAiService();

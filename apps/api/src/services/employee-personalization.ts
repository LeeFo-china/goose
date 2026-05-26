import {
  employeePersonalizationRepository,
  type EmployeePersonalizationRuleRecord,
  type EmployeePersonalizationRuleMutationRecord,
} from "@/repositories/employee-personalization";
import { Errors } from "@/errors/error-factory";
import type {
  EmployeePersonalizationPreviewInput,
  EmployeePersonalizationRuleListQuery,
  EmployeePersonalizationRuleMutationInput,
} from "@/schema/employee-personalization";
import type { AuthContext } from "@/services/authorization";

export type EmployeePersonalizationMatchedScope =
  | "employee"
  | "department_post"
  | "post"
  | "department"
  | "role"
  | "tenant_default";

export type EmployeePersonalizationMatchedRule = {
  id: string;
  scope: EmployeePersonalizationMatchedScope;
};

export type EmployeePersonalizationScenePayload = {
  blocks: unknown[];
  quick_actions: unknown[];
  [key: string]: unknown;
};

export type EmployeePersonalizationPayload = {
  version: string;
  matched_rule: EmployeePersonalizationMatchedRule | null;
  scenes: Record<string, EmployeePersonalizationScenePayload>;
};

type MatchedRuleCandidate = {
  rule: EmployeePersonalizationRuleRecord;
  scope: EmployeePersonalizationMatchedScope;
  scopeWeight: number;
};

const EMPTY_VERSION = "empty";

const scopeWeights: Record<EmployeePersonalizationMatchedScope, number> = {
  employee: 60,
  department_post: 50,
  post: 40,
  department: 30,
  role: 20,
  tenant_default: 10,
};

const normalizeScene = (scene: string) => scene.trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toTimestamp = (value: string | null) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

class EmployeePersonalizationService {
  private requireTenantId(tenantId?: string | null) {
    if (!tenantId) {
      throw Errors.business(
        403,
        "员工个性化配置必须在租户上下文中操作",
        "TENANT_CONTEXT_REQUIRED",
      );
    }

    return tenantId;
  }

  private toMutationRecord(
    input: EmployeePersonalizationRuleMutationInput,
  ): EmployeePersonalizationRuleMutationRecord {
    return {
      scene: input.scene,
      employee_id: input.scope === "employee" ? input.employee_id ?? null : null,
      tenant_department_id:
        input.scope === "department" || input.scope === "department_post"
          ? input.tenant_department_id ?? null
          : null,
      post_id:
        input.scope === "post" || input.scope === "department_post"
          ? input.post_id ?? null
          : null,
      role_code: input.scope === "role" ? input.role_code || null : null,
      priority: input.priority,
      content_json: input.content_json,
      status: input.status,
      starts_at: input.starts_at ?? null,
      ends_at: input.ends_at ?? null,
    };
  }

  private assertMutationScope(input: EmployeePersonalizationRuleMutationInput) {
    if (input.scope === "employee" && !input.employee_id) {
      throw Errors.badRequest("员工规则必须选择员工");
    }
    if (input.scope === "department" && !input.tenant_department_id) {
      throw Errors.badRequest("部门规则必须选择租户部门");
    }
    if (input.scope === "post" && !input.post_id) {
      throw Errors.badRequest("岗位规则必须选择岗位");
    }
    if (
      input.scope === "department_post" &&
      (!input.tenant_department_id || !input.post_id)
    ) {
      throw Errors.badRequest("部门岗位规则必须同时选择部门和岗位");
    }
    if (input.scope === "role" && !input.role_code) {
      throw Errors.badRequest("角色规则必须选择角色");
    }
  }

  private getRuleScope(
    rule: EmployeePersonalizationRuleRecord,
  ): EmployeePersonalizationMatchedScope {
    if (rule.employee_id) return "employee";
    if (rule.tenant_department_id && rule.post_id) return "department_post";
    if (rule.post_id) return "post";
    if (rule.tenant_department_id) return "department";
    if (rule.role_code) return "role";
    return "tenant_default";
  }

  private serializeRule(rule: EmployeePersonalizationRuleRecord) {
    return {
      ...rule,
      scope: this.getRuleScope(rule),
    };
  }

  async listRules(input: {
    authContext: AuthContext;
    query: EmployeePersonalizationRuleListQuery;
  }) {
    const tenantId = this.requireTenantId(input.authContext.tenantId);
    const [rules, options] = await Promise.all([
      employeePersonalizationRepository.listRules({
        tenantId,
        page: input.query.page,
        pageSize: input.query.pageSize,
        scene: input.query.scene,
        status: input.query.status,
        keyword: input.query.keyword,
      }),
      employeePersonalizationRepository.listOptions(tenantId),
    ]);

    return {
      list: rules.list.map((rule) => this.serializeRule(rule)),
      pagination: rules.pagination,
      options,
    };
  }

  async getRuleById(input: { authContext: AuthContext; id: string }) {
    const tenantId = this.requireTenantId(input.authContext.tenantId);
    const rule = await employeePersonalizationRepository.getRuleById({
      tenantId,
      id: input.id,
    });
    if (!rule) throw Errors.notFound("员工个性化规则不存在");
    return this.serializeRule(rule);
  }

  async createRule(input: {
    authContext: AuthContext;
    body: EmployeePersonalizationRuleMutationInput;
  }) {
    const tenantId = this.requireTenantId(input.authContext.tenantId);
    this.assertMutationScope(input.body);
    const rule = await employeePersonalizationRepository.createRule({
      tenantId,
      record: this.toMutationRecord(input.body),
      operatorEmployeeId: input.authContext.employeeId,
    });
    return this.serializeRule(rule);
  }

  async updateRule(input: {
    authContext: AuthContext;
    id: string;
    body: EmployeePersonalizationRuleMutationInput;
  }) {
    const tenantId = this.requireTenantId(input.authContext.tenantId);
    this.assertMutationScope(input.body);
    const rule = await employeePersonalizationRepository.updateRule({
      tenantId,
      id: input.id,
      record: this.toMutationRecord(input.body),
      operatorEmployeeId: input.authContext.employeeId,
    });
    if (!rule) throw Errors.notFound("员工个性化规则不存在");
    return this.serializeRule(rule);
  }

  async updateRuleStatus(input: {
    authContext: AuthContext;
    id: string;
    status: "draft" | "active" | "disabled";
  }) {
    const tenantId = this.requireTenantId(input.authContext.tenantId);
    const rule = await employeePersonalizationRepository.updateRuleStatus({
      tenantId,
      id: input.id,
      status: input.status,
      operatorEmployeeId: input.authContext.employeeId,
    });
    if (!rule) throw Errors.notFound("员工个性化规则不存在");
    return this.serializeRule(rule);
  }

  async preview(input: {
    authContext: AuthContext;
    body: EmployeePersonalizationPreviewInput;
  }) {
    const tenantId = this.requireTenantId(input.authContext.tenantId);
    let previewContext: AuthContext = {
      ...input.authContext,
      tenantDepartmentId: input.body.tenant_department_id ?? null,
      postId: input.body.post_id ?? null,
      roleCodes: input.body.role_codes,
    };

    if (input.body.employee_id) {
      const employeeContext =
        await employeePersonalizationRepository.getEmployeePreviewContext({
          tenantId,
          employeeId: input.body.employee_id,
        });
      if (!employeeContext.employee) {
        throw Errors.badRequest("员工不存在或不属于当前租户");
      }
      previewContext = {
        ...previewContext,
        employeeId: employeeContext.employee.id,
        employeeName: employeeContext.employee.name,
        employeeStatus: employeeContext.employee.status,
        tenantDepartmentId: employeeContext.employee.tenant_department_id,
        postId: employeeContext.employee.post_id,
        roleCodes: employeeContext.roleCodes,
      };
    }

    return this.resolveForEmployee(previewContext, input.body.scene);
  }

  getEmptyPayload(scene: string): EmployeePersonalizationPayload {
    const normalizedScene = normalizeScene(scene) || "default";
    return {
      version: EMPTY_VERSION,
      matched_rule: null,
      scenes: {
        [normalizedScene]: {
          blocks: [],
          quick_actions: [],
        },
      },
    };
  }

  private isRuleCurrentlyActive(
    rule: EmployeePersonalizationRuleRecord,
    now: number,
  ) {
    const startsAt = toTimestamp(rule.starts_at);
    const endsAt = toTimestamp(rule.ends_at);

    if (startsAt !== null && startsAt > now) {
      return false;
    }

    if (endsAt !== null && endsAt <= now) {
      return false;
    }

    return true;
  }

  private getMatchedScope(
    rule: EmployeePersonalizationRuleRecord,
    authContext: AuthContext,
  ): EmployeePersonalizationMatchedScope | null {
    if (rule.employee_id) {
      return rule.employee_id === authContext.employeeId ? "employee" : null;
    }

    if (rule.tenant_department_id && rule.post_id) {
      return rule.tenant_department_id === authContext.tenantDepartmentId &&
          rule.post_id === authContext.postId
        ? "department_post"
        : null;
    }

    if (rule.post_id) {
      return rule.post_id === authContext.postId ? "post" : null;
    }

    if (rule.tenant_department_id) {
      return rule.tenant_department_id === authContext.tenantDepartmentId
        ? "department"
        : null;
    }

    if (rule.role_code) {
      return authContext.roleCodes.includes(rule.role_code) ? "role" : null;
    }

    return "tenant_default";
  }

  private pickBestRule(
    rules: EmployeePersonalizationRuleRecord[],
    authContext: AuthContext,
    now: number,
  ): MatchedRuleCandidate | null {
    const candidates = rules
      .filter((rule) => this.isRuleCurrentlyActive(rule, now))
      .map((rule): MatchedRuleCandidate | null => {
        const scope = this.getMatchedScope(rule, authContext);
        if (!scope) return null;
        return {
          rule,
          scope,
          scopeWeight: scopeWeights[scope],
        };
      })
      .filter((item): item is MatchedRuleCandidate => item !== null);

    candidates.sort((a, b) => {
      if (a.scopeWeight !== b.scopeWeight) {
        return b.scopeWeight - a.scopeWeight;
      }

      if (a.rule.priority !== b.rule.priority) {
        return b.rule.priority - a.rule.priority;
      }

      return (
        toTimestamp(b.rule.updated_at) ?? 0
      ) - (
        toTimestamp(a.rule.updated_at) ?? 0
      );
    });

    return candidates[0] ?? null;
  }

  private normalizeSceneContent(
    contentJson: unknown,
  ): EmployeePersonalizationScenePayload {
    const content = isRecord(contentJson) ? contentJson : {};
    return {
      ...content,
      blocks: Array.isArray(content.blocks) ? content.blocks : [],
      quick_actions: Array.isArray(content.quick_actions)
        ? content.quick_actions
        : [],
    };
  }

  async resolveForEmployee(
    authContext: AuthContext,
    scene: string,
  ): Promise<EmployeePersonalizationPayload> {
    const normalizedScene = normalizeScene(scene);
    if (!normalizedScene || !authContext.tenantId) {
      return this.getEmptyPayload(normalizedScene || "default");
    }

    const rules = await employeePersonalizationRepository.listActiveRulesForScene({
      tenantId: authContext.tenantId,
      scene: normalizedScene,
    });
    const matched = this.pickBestRule(rules, authContext, Date.now());

    if (!matched) {
      return this.getEmptyPayload(normalizedScene);
    }

    return {
      version: matched.rule.updated_at || matched.rule.id,
      matched_rule: {
        id: matched.rule.id,
        scope: matched.scope,
      },
      scenes: {
        [normalizedScene]: this.normalizeSceneContent(
          matched.rule.content_json,
        ),
      },
    };
  }
}

export const employeePersonalizationService =
  new EmployeePersonalizationService();

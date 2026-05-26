import {
  employeePersonalizationRepository,
  type EmployeePersonalizationRuleRecord,
} from "@/repositories/employee-personalization";
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

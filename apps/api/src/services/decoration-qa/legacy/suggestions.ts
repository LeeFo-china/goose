import type { TenantServiceRouteAccess } from '@gooes/domain';

import {
  Errors,
  authorizationService,
  aiGateway,
  decorationQaSuggestionCacheRepository,
  type DecorationQaSuggestionQueryInput,
  type DecorationQaSuggestionResult,
  type DecorationQaSuggestionScene,
  type DecorationQaUsageContext,
  SUGGESTION_SYSTEM_PROMPT,
  FALLBACK_VISITOR,
  FALLBACK_CUSTOMER,
  FALLBACK_EMPLOYEE,
  SUGGESTION_MEMORY_CACHE_TTL_MS,
  suggestionMemoryCache,
  suggestionInFlight,
} from './shared';
import { getCustomerContextByAuthUserId } from './identity';
import { resolveDecorationQaUsageContext } from './usage';
import { buildCustomerProjectQaContext } from './project-context';
import { formatCustomerProjectSuggestionContext } from './project-format';
import {
  getFallbackSuggestionQuestions,
  normalizeSuggestionQuestions,
} from './ai-runtime';

export function getSuggestionDateKey(now: Date) {
  return now.toISOString().slice(0, 10);
}

export function buildSuggestionCacheKey(input: {
  scene: DecorationQaSuggestionScene;
  projectId: string | null;
  now: Date;
}) {
  const dateKey = getSuggestionDateKey(input.now);

  if (input.scene === "customer" && input.projectId) {
    return `customer:${input.projectId}:${dateKey}`;
  }

  return `${input.scene}:${dateKey}`;
}

export function getSuggestionExpiresAt(input: {
  scene: DecorationQaSuggestionScene;
  projectId: string | null;
  now: Date;
}) {
  if (input.scene === "customer" && input.projectId) {
    return new Date(input.now.getTime() + 6 * 60 * 60 * 1000);
  }

  const expiresAt = new Date(input.now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);
  expiresAt.setUTCHours(0, 0, 0, 0);
  return expiresAt;
}

export async function buildSuggestionScenePrompt(input: {
  scene: DecorationQaSuggestionScene;
  projectId: string | null;
  authUserId?: string;
}) {
  if (input.scene === "visitor") {
    return "用户是普通访客，还没有明确项目。问题应覆盖预算、流程、材料、工期、验收等通用主题。";
  }

  if (!input.authUserId) {
    throw Errors.unauthorized("缺少登录凭证");
  }

  if (input.scene === "employee") {
    return "用户是装修公司员工。问题可以偏向客户沟通、施工解释、材料工艺说明。";
  }

  if (input.projectId) {
    const context = await buildCustomerProjectQaContext(
      input.authUserId,
      input.projectId,
    );

    return [
      "用户是装修客户。请优先结合当前项目阶段生成问题，问题应该站在客户视角，便于客户点击咨询。",
      "当前项目摘要：",
      formatCustomerProjectSuggestionContext(context),
    ].join("\n");
  }

  await getCustomerContextByAuthUserId(input.authUserId);
  return "用户是装修客户，但当前没有指定项目。请生成客户视角的通用装修问题，重点覆盖流程、验收、费用确认和工期沟通。";
}

export async function generateSuggestionQuestionsByAi(
  scenePrompt: string,
  usageContext: DecorationQaUsageContext,
) {
  const result = await aiGateway.chat({
    sceneCode: "decoration_qa_title",
    tenantId: usageContext.tenantId,
    source: usageContext.source,
    billable: usageContext.billable,
    metadata: {
      source: usageContext.source,
      auth_user_id: usageContext.authUserId ?? null,
      customer_id: usageContext.customerId ?? null,
      employee_id: usageContext.employeeId ?? null,
      project_id: usageContext.projectId ?? null,
    },
    temperature: 0.8,
    messages: [
      { role: "system", content: SUGGESTION_SYSTEM_PROMPT },
      { role: "user", content: scenePrompt },
    ],
  });
  const content = result.content;

  if (!content) {
    throw Errors.dbError("大模型未返回有效推荐问题");
  }

  return content;
}

export async function tryGetCachedSuggestion(cacheKey: string, now: Date) {
  try {
    return await decorationQaSuggestionCacheRepository.findValid(cacheKey, now);
  } catch {
    return null;
  }
}

export function cloneSuggestionResult(result: DecorationQaSuggestionResult): DecorationQaSuggestionResult {
  return {
    ...result,
    list: [...result.list],
  };
}

export function getMemoryCachedSuggestion(cacheKey: string, nowMs: number) {
  const cached = suggestionMemoryCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= nowMs) {
    suggestionMemoryCache.delete(cacheKey);
    return null;
  }

  return cloneSuggestionResult({
    ...cached.result,
    source: "cache",
  });
}

export function setMemoryCachedSuggestion(
  cacheKey: string,
  result: DecorationQaSuggestionResult,
  nowMs: number,
) {
  suggestionMemoryCache.set(cacheKey, {
    result: cloneSuggestionResult(result),
    expiresAt: nowMs + SUGGESTION_MEMORY_CACHE_TTL_MS,
  });
}

export function getSuggestionInFlight(cacheKey: string) {
  return suggestionInFlight.get(cacheKey) ?? null;
}

export function setSuggestionInFlight(
  cacheKey: string,
  promise: Promise<DecorationQaSuggestionResult>,
) {
  suggestionInFlight.set(cacheKey, promise);
  void promise.finally(() => {
    if (suggestionInFlight.get(cacheKey) === promise) {
      suggestionInFlight.delete(cacheKey);
    }
  });
  return promise;
}

export async function trySaveSuggestionCache(input: {
  cacheKey: string;
  scene: DecorationQaSuggestionScene;
  projectId: string | null;
  questions: string[];
  source: "ai" | "fallback";
  expiresAt: Date;
}) {
  try {
    await decorationQaSuggestionCacheRepository.upsert({
      cache_key: input.cacheKey,
      scene: input.scene,
      project_id: input.projectId,
      questions: input.questions,
      source: input.source,
      expires_at: input.expiresAt.toISOString(),
    });
  } catch {
    // Cache failures must not block the question page.
  }
}

export async function getDecorationQaSuggestions(input: {
  query: DecorationQaSuggestionQueryInput;
  tenantServiceAccess: TenantServiceRouteAccess;
  authUserId?: string;
  tenantId?: string | null;
  customerId?: string | null;
  employeeId?: string | null;
  roles?: string[];
}): Promise<DecorationQaSuggestionResult> {
  const now = new Date();
  const nowMs = now.getTime();
  const scene = input.query.scene;
  if (scene === "employee") {
    if (!input.authUserId) {
      throw Errors.unauthorized("缺少登录凭证");
    }
    const authContext = await authorizationService.getRequiredAuthContext(
      input.authUserId,
      { tenantServiceAccess: input.tenantServiceAccess },
    );
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }
  }
  const projectId = scene === "customer"
    ? input.query.project_id ?? null
    : null;
  const cacheKey = buildSuggestionCacheKey({ scene, projectId, now });
  const expiresAt = getSuggestionExpiresAt({ scene, projectId, now });
  if (!input.query.refresh) {
    const memoryCached = getMemoryCachedSuggestion(cacheKey, nowMs);
    if (memoryCached) {
      return memoryCached;
    }

    const inFlight = getSuggestionInFlight(cacheKey);
    if (inFlight) {
      return cloneSuggestionResult(await inFlight);
    }
  }

  const loadSuggestion = async (): Promise<DecorationQaSuggestionResult> => {
    const scenePrompt = await buildSuggestionScenePrompt({
      scene,
      projectId,
      authUserId: input.authUserId,
    });

    if (!input.query.refresh) {
      const cached = await tryGetCachedSuggestion(cacheKey, now);
      if (cached) {
        const result: DecorationQaSuggestionResult = {
          list: normalizeSuggestionQuestions(cached.questions, scene),
          source: "cache",
          cache_key: cacheKey,
          expires_at: cached.expires_at,
        };
        setMemoryCachedSuggestion(cacheKey, result, nowMs);
        return result;
      }
    }

    const usageContext = await resolveDecorationQaUsageContext({
      authUserId: input.authUserId,
      tenantId: input.tenantId,
      customerId: input.customerId,
      employeeId: input.employeeId,
      roles: input.roles,
      role: scene,
      projectId,
    });

    try {
      const aiQuestions = normalizeSuggestionQuestions(
        await generateSuggestionQuestionsByAi(scenePrompt, usageContext),
        scene,
      );
      await trySaveSuggestionCache({
        cacheKey,
        scene,
        projectId,
        questions: aiQuestions,
        source: "ai",
        expiresAt,
      });

      const result: DecorationQaSuggestionResult = {
        list: aiQuestions,
        source: "ai",
        cache_key: cacheKey,
        expires_at: expiresAt.toISOString(),
      };
      setMemoryCachedSuggestion(cacheKey, result, nowMs);
      return result;
    } catch {
      const fallbackQuestions = getFallbackSuggestionQuestions(scene);
      await trySaveSuggestionCache({
        cacheKey,
        scene,
        projectId,
        questions: fallbackQuestions,
        source: "fallback",
        expiresAt,
      });

      const result: DecorationQaSuggestionResult = {
        list: fallbackQuestions,
        source: "fallback",
        cache_key: cacheKey,
        expires_at: expiresAt.toISOString(),
      };
      setMemoryCachedSuggestion(cacheKey, result, nowMs);
      return result;
    }
  };

  if (input.query.refresh) {
    return loadSuggestion();
  }

  return cloneSuggestionResult(await setSuggestionInFlight(cacheKey, loadSuggestion()));
}

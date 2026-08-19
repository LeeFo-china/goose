import {
  AdminTenantServiceAccessSchema,
  type AdminTenantServiceAccess,
} from "@gooes/domain";
import { z } from "zod";

import {
  buildBackendUrl,
  parseBackendJson,
  type AdminSession,
} from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

export type TenantServiceAccessLoadResult =
  | { kind: "bypass" }
  | { kind: "ready"; summary: AdminTenantServiceAccess }
  | { kind: "unavailable"; message: string };

type LoadTenantServiceAccessInput = {
  session: AdminSession;
  token: string | null;
  fetchImpl?: typeof fetch;
};

const UNAVAILABLE_MESSAGE = "服务状态暂时无法加载，请稍后重试";

const BackendResponseEnvelopeSchema = z.object({
  success: z.boolean().optional(),
  data: z.unknown().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
  requestId: z.string().optional(),
});

function unavailable(): TenantServiceAccessLoadResult {
  return { kind: "unavailable", message: UNAVAILABLE_MESSAGE };
}

export async function loadTenantServiceAccess({
  session,
  token,
  fetchImpl = fetch,
}: LoadTenantServiceAccessInput): Promise<TenantServiceAccessLoadResult> {
  if (isPlatformOnlySession(session)) {
    return { kind: "bypass" };
  }

  if (!session.tenant || !token) {
    return unavailable();
  }

  try {
    const response = await fetchImpl(
      buildBackendUrl("/employee/service-access"),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<unknown>(response);
    const parsedEnvelope = BackendResponseEnvelopeSchema.safeParse(payload);
    if (!parsedEnvelope.success) {
      return unavailable();
    }

    const parsedSummary = AdminTenantServiceAccessSchema.safeParse(
      parsedEnvelope.data.data,
    );
    if (!parsedSummary.success) {
      return unavailable();
    }

    return { kind: "ready", summary: parsedSummary.data };
  } catch {
    return unavailable();
  }
}

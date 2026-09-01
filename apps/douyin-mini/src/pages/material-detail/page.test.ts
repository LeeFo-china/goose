import { describe, expect, mock, test } from "bun:test";

import type {
  DouyinMaterialNoteClaimResponse,
  DouyinMaterialNotePreview,
} from "../../models";
import { createMaterialDetailPageDefinition } from "./page";

const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const CLAIM_ID = "22222222-2222-4222-8222-222222222222";
const preview: DouyinMaterialNotePreview = {
  id: NOTE_ID,
  title: "开工清单",
  summary: "开工前逐项确认",
  category: "施工避坑",
  applicable_to: "准备开工的业主",
  published_at: "2026-09-01T08:00:00.000Z",
  claimed: false,
};
const claim: DouyinMaterialNoteClaimResponse = {
  claim_id: CLAIM_ID,
  already_claimed: false,
  claimed_at: "2026-09-01T08:30:00.000Z",
  material: {
    id: NOTE_ID,
    version: 1,
    title: preview.title,
    summary: preview.summary,
    category: preview.category,
    applicable_to: preview.applicable_to,
    content_blocks: [{ type: "paragraph", text: "正文" }],
  },
};
const bootstrap = { theme: { primary_color: "#191817" } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function harness(overrides: Record<string, unknown> = {}) {
  const analytics: Array<{ name: string; id?: string }> = [];
  const toasts: string[] = [];
  const order: string[] = [];
  const fetchMaterialPreview = mock(async () => preview);
  const claimMaterial = mock(async () => claim);
  const copyTextToClipboard = mock(async () => undefined);
  const switchToTab = mock(async (tab: "budget" | "lead") => {
    order.push(`navigate:${tab}`);
  });
  const dependencies = {
    getApp: () => ({
      api: {},
      bootstrap: { getReadyOrLoad: async () => bootstrap },
      recordAnalytics(name: string, id?: string) {
        order.push(`analytics:${name}`);
        analytics.push({ name, ...(id ? { id } : {}) });
      },
    }),
    fetchMaterialPreview,
    fetchOwnedMaterialDetail: mock(async () => { throw new Error("unused"); }),
    claimMaterial,
    toMaterialBusinessError: () => null,
    copyTextToClipboard,
    navigateToPage: mock(async () => undefined),
    switchToTab,
    showToast: (options: { title: string }) => { toasts.push(options.title); },
    ...overrides,
  };
  const definition = createMaterialDetailPageDefinition(dependencies as never);
  const setDataCalls: unknown[] = [];
  const page = Object.assign(definition, {
    data: structuredClone(definition.data),
    setData(update: Record<string, unknown>) {
      setDataCalls.push(update);
      Object.assign(this.data, update);
    },
  }) as typeof definition & { setData(update: Record<string, unknown>): void };
  page.onLoad({ id: NOTE_ID });
  return {
    page,
    analytics,
    toasts,
    order,
    setDataCalls,
    fetchMaterialPreview: dependencies.fetchMaterialPreview as typeof fetchMaterialPreview,
    claimMaterial: dependencies.claimMaterial as typeof claimMaterial,
    copyTextToClipboard: dependencies.copyTextToClipboard as typeof copyTextToClipboard,
    switchToTab: dependencies.switchToTab as typeof switchToTab,
  };
}

describe("material detail page controller", () => {
  test("a claimed preview automatically resolves through exactly one idempotent claim", async () => {
    const context = harness({
      fetchMaterialPreview: mock(async () => ({ ...preview, claimed: true })),
    });

    await context.page.load();

    expect(context.claimMaterial).toHaveBeenCalledTimes(1);
    expect(context.page.pageState?.status).toBe("claimed");
    expect(context.page.data.content?.content_blocks).toEqual(claim.material.content_blocks);
  });

  test("an uncertain POST performs one GET recovery and never automatically POSTs twice", async () => {
    let previewCalls = 0;
    const context = harness({
      fetchMaterialPreview: mock(async () => ({
        ...preview,
        claimed: previewCalls++ > 0,
      })),
      claimMaterial: mock(async () => { throw new Error("timeout"); }),
    });
    await context.page.load();

    await context.page.executeClaim();

    expect(context.fetchMaterialPreview).toHaveBeenCalledTimes(2);
    expect(context.claimMaterial).toHaveBeenCalledTimes(1);
    expect(context.page.pageState?.status).toBe("recovery-required");
  });

  test("old copy success and failure have zero effects after hide, unload, or hide-show", async () => {
    for (const outcome of ["success", "failure"] as const) {
      for (const transition of ["hide", "unload", "hide-show"] as const) {
        const clipboard = deferred<void>();
        const context = harness({
          copyTextToClipboard: mock(() => clipboard.promise),
        });
        await context.page.load();
        await context.page.executeClaim();
        const copyFlight = context.page.onCopy();
        await transitionPage(context.page, transition);
        const snapshot = effects(context);
        if (outcome === "success") clipboard.resolve();
        else clipboard.reject(new Error("late copy failure"));
        await copyFlight;
        expect(effects(context)).toEqual(snapshot);
      }
    }
  });

  test("old navigation failures have zero effects after hide, unload, or hide-show", async () => {
    for (const transition of ["hide", "unload", "hide-show"] as const) {
      const navigation = deferred<void>();
      const context = harness({ switchToTab: mock(() => navigation.promise) });
      await context.page.load();
      await context.page.executeClaim();
      context.page.onBudget();
      await transitionPage(context.page, transition);
      const snapshot = effects(context);
      navigation.reject(new Error("late navigation failure"));
      await Bun.sleep(0);
      expect(effects(context)).toEqual(snapshot);
    }
  });

  test("hidden bootstrap and claim continuations cannot write, toast, or start recovery", async () => {
    const bootstrapFlight = deferred<typeof bootstrap>();
    const bootstrapContext = harness({
      getApp: () => ({
        api: {},
        bootstrap: { getReadyOrLoad: () => bootstrapFlight.promise },
        recordAnalytics: () => undefined,
      }),
    });
    const loadFlight = bootstrapContext.page.load();
    bootstrapContext.page.onHide();
    const bootstrapSnapshot = effects(bootstrapContext);
    bootstrapFlight.resolve(bootstrap);
    await loadFlight;
    expect(effects(bootstrapContext)).toEqual(bootstrapSnapshot);

    const claimFlight = deferred<DouyinMaterialNoteClaimResponse>();
    const claimContext = harness({ claimMaterial: mock(() => claimFlight.promise) });
    await claimContext.page.load();
    const operation = claimContext.page.executeClaim();
    claimContext.page.onHide();
    const claimSnapshot = effects(claimContext);
    claimFlight.reject(new Error("late uncertain result"));
    await operation;
    expect(effects(claimContext)).toEqual(claimSnapshot);
    expect(claimContext.fetchMaterialPreview).toHaveBeenCalledTimes(1);
  });

  test("budget and lead record before navigation and stale navigation failures never toast", async () => {
    const navigation = deferred<void>();
    const context = harness({
      switchToTab: mock((tab: "budget" | "lead") => {
        context.order.push(`navigate:${tab}`);
        return navigation.promise;
      }),
    });
    await context.page.load();
    await context.page.executeClaim();
    context.order.length = 0;
    context.page.onBudget();
    expect(context.order).toEqual([
      "analytics:material_budget_click",
      "navigate:budget",
    ]);
    context.page.onHide();
    context.page.onShow();
    await Bun.sleep(0);
    const toastCount = context.toasts.length;
    navigation.reject(new Error("late navigation failure"));
    await Bun.sleep(0);
    expect(context.toasts).toHaveLength(toastCount);

    const lead = harness();
    await lead.page.load();
    await lead.page.executeClaim();
    lead.order.length = 0;
    lead.page.onLead();
    expect(lead.order).toEqual([
      "analytics:material_lead_click",
      "navigate:lead",
    ]);
  });
});

function effects(context: ReturnType<typeof harness>) {
  return {
    analytics: context.analytics.length,
    toasts: context.toasts.length,
    writes: context.setDataCalls.length,
    previewLoads: context.fetchMaterialPreview.mock.calls.length,
  };
}

async function transitionPage(
  page: ReturnType<typeof harness>["page"],
  transition: "hide" | "unload" | "hide-show",
) {
  page.onHide();
  if (transition === "unload") page.onUnload();
  if (transition === "hide-show") {
    page.onShow();
    await Bun.sleep(0);
    await Bun.sleep(0);
  }
}

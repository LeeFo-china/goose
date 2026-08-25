import { describe, expect, test } from "bun:test";

import { createQaPageDefinition, type QaPageClock } from "./qa-page";
import type { DouyinAppContext } from "../../app";
import type { ApiClient } from "../../api/request";
import type { DouyinQaAnswer, LaunchContext } from "../../models";

const attribution: LaunchContext = {
  entry_path: "pages/qa/index",
  scene: "021001",
  source_type: "direct",
};

const answer: DouyinQaAnswer = {
  answer_points: ["先确认面积。", "再确认装修范围。"],
  suggested_questions: ["量房前准备什么？"],
  disclaimer: "以上内容仅供装修沟通参考，具体方案以现场量房为准。",
};

class ManualClock implements QaPageClock {
  private nextId = 1;
  private readonly timers = new Map<number, () => void>();

  setTimeout(callback: () => void): number {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, callback);
    return id;
  }

  clearTimeout(id: number): void {
    this.timers.delete(id);
  }

  runNext(): void {
    const [id, callback] = this.timers.entries().next().value as
      | [number, () => void]
      | undefined ?? [];
    if (!id || !callback) return;
    this.timers.delete(id);
    callback();
  }

  runAll(): void {
    while (this.timers.size) this.runNext();
  }

  get size(): number {
    return this.timers.size;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function createPage(options: {
  readonly clock?: ManualClock;
  readonly ask?: (question: string) => Promise<DouyinQaAnswer>;
} = {}) {
  const clock = options.clock ?? new ManualClock();
  const patches: Array<Record<string, unknown>> = [];
  const page = createQaPageDefinition({
    getApp: () => ({
      api: {} as ApiClient,
      analytics: {},
      bootstrap: {},
      launchContext: attribution,
      recordAnalytics: () => undefined,
      startup: Promise.resolve(null),
    } as unknown as DouyinAppContext),
    askDecorationQuestion: async (_client, input) => {
      if (options.ask) return options.ask(input.question);
      return answer;
    },
    switchToTab: async () => undefined,
    showToast: () => undefined,
    clock,
  }) as ReturnType<typeof createQaPageDefinition> & {
    setData(patch: Record<string, unknown>): void;
  };
  page.setData = (patch) => {
    patches.push(patch);
    page.data = { ...page.data, ...patch };
  };
  return { page, clock, patches };
}

describe("Douyin Q&A page definition", () => {
  test("renders answer chunks through timers before showing suggestions", async () => {
    const { page, clock } = createPage();

    await page.submit("旧房怎么装修？");

    expect(page.data.status).toBe("submitting");
    expect(page.data.stream?.messages[1]).toMatchObject({ text: "", typing: true });
    clock.runNext();
    expect(page.data.stream?.messages[1]).toMatchObject({ text: "先确认面积。", typing: true });
    expect(page.data.stream?.suggestedQuestions).toEqual([]);
    clock.runNext();
    expect(page.data.stream?.messages[1]).toMatchObject({
      text: "先确认面积。\n再确认装修范围。",
      typing: true,
    });
    clock.runNext();
    expect(page.data.status).toBe("answered");
    expect(page.data.stream?.messages[1]).toMatchObject({ typing: false });
    expect(page.data.stream?.suggestedQuestions).toEqual(["量房前准备什么？"]);
    expect(page.data.stream?.disclaimer).toBe(answer.disclaimer);
    expect(clock.size).toBe(0);
  });

  test("unload cancels scheduled chunks and prevents late page writes", async () => {
    const { page, clock, patches } = createPage();

    await page.submit("旧房怎么装修？");
    clock.runNext();
    const writesBeforeUnload = patches.length;
    page.onUnload();
    clock.runAll();

    expect(patches).toHaveLength(writesBeforeUnload);
    expect(clock.size).toBe(0);
  });

  test("an older answer cannot overwrite a newer submitted question", async () => {
    const first = deferred<DouyinQaAnswer>();
    const second = deferred<DouyinQaAnswer>();
    const { page, clock } = createPage({
      ask: (question) => question.includes("旧房") ? first.promise : second.promise,
    });

    const firstSubmit = page.submit("旧房怎么装修？");
    const secondSubmit = page.submit("量房前准备什么？");
    first.resolve(answer);
    await firstSubmit;
    expect(page.data.stream?.messages[0].text).toBe("量房前准备什么？");

    second.resolve({
      ...answer,
      answer_points: ["准备户型图。"],
    });
    await secondSubmit;
    clock.runAll();

    expect(page.data.status).toBe("answered");
    expect(page.data.stream?.messages[0].text).toBe("量房前准备什么？");
    expect(page.data.stream?.messages[1].text).toBe("准备户型图。");
  });
});

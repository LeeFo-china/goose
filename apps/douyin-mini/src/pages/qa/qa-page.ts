import type { DouyinAppContext } from "../../app";
import type { askDecorationQuestion } from "../../api/qa";
import type { DouyinQaAnswer } from "../../models";
import type { switchToTab } from "../../platform/navigation";
import {
  appendAnswerChunk,
  beginAnswerStream,
  buildAnswerChunks,
  finishAnswerStream,
  type QaStreamState,
} from "./streaming";

const PRESET_QUESTIONS = [
  "装修预算前要先准备哪些信息？",
  "旧房翻新要先看哪些地方？",
  "局部装修适合先确认什么？",
  "量房前需要准备什么？",
] as const;

type QaStatus = "idle" | "submitting" | "answered" | "failed";

type QaSubmitEvent = {
  detail?: {
    value?: {
      question?: unknown;
    };
  };
};

type QaConfirmEvent = {
  detail?: {
    value?: unknown;
  };
};

export type QaPageClock = {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(timer: unknown): void;
};

const defaultClock: QaPageClock = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export type QaPageDependencies = {
  getApp(): DouyinAppContext;
  askDecorationQuestion: typeof askDecorationQuestion;
  switchToTab: typeof switchToTab;
  showToast(options: { title: string; icon: "none" }): void;
  clock?: QaPageClock;
};

export function createQaPageDefinition(dependencies: QaPageDependencies) {
  const clock = dependencies.clock ?? defaultClock;
  return definePage({
    requestSequence: 0,
    typingTimer: null as unknown,
    data: {
      status: "idle" as QaStatus,
      question: "",
      stream: null as QaStreamState | null,
      presetQuestions: [...PRESET_QUESTIONS],
      errorMessage: "",
    },
    onLoad() {
      dependencies.getApp().recordAnalytics("page_view");
    },
    onUnload() {
      this.requestSequence += 1;
      this.clearTypingTimer();
    },
    onQuestionInput(event: { detail: { value?: string } }) {
      this.setData({ question: event.detail.value || "" });
    },
    onPresetTap(event: { currentTarget: { dataset: { question?: string } } }) {
      const question = event.currentTarget.dataset.question || "";
      this.setData({ question });
      void this.submit(question);
    },
    onSubmit(event?: QaSubmitEvent) {
      return this.submit(readSubmitQuestion(event) ?? this.data.question);
    },
    onQuestionConfirm(event: QaConfirmEvent) {
      return this.submit(readConfirmQuestion(event) ?? this.data.question);
    },
    onSuggestedQuestionTap(event: { currentTarget: { dataset: { question?: string } } }) {
      const question = event.currentTarget.dataset.question || "";
      this.setData({ question });
      void this.submit(question);
    },
    onBookMeasurement() {
      void dependencies.switchToTab("lead").catch(() => dependencies.showToast({
        title: "页面跳转失败，请重试",
        icon: "none",
      }));
    },
    async submit(rawQuestion: string) {
      const question = rawQuestion.trim();
      if (question.length < 2) {
        dependencies.showToast({ title: "请输入想咨询的问题", icon: "none" });
        return;
      }
      if (question.length > 120) {
        dependencies.showToast({ title: "问题请控制在120字以内", icon: "none" });
        return;
      }
      this.clearTypingTimer();
      const sequence = this.requestSequence + 1;
      this.requestSequence = sequence;
      this.setData({
        status: "submitting",
        question: "",
        errorMessage: "",
        stream: beginAnswerStream(question),
      });
      try {
        const app = dependencies.getApp();
        const answer = await dependencies.askDecorationQuestion(app.api, {
          question,
          attribution: app.launchContext,
        });
        if (this.requestSequence !== sequence) return;
        this.playAnswerStream(sequence, answer);
      } catch {
        if (this.requestSequence !== sequence) return;
        this.setData({
          status: "failed",
          stream: null,
          errorMessage: "暂时无法回答，请稍后重试或提交量房需求。",
        });
      }
    },
    playAnswerStream(sequence: number, answer: DouyinQaAnswer) {
      const chunks = buildAnswerChunks(answer);
      let index = 0;
      const emitNext = () => {
        this.typingTimer = null;
        if (this.requestSequence !== sequence) return;
        const current = this.data.stream;
        if (!current) return;
        if (index >= chunks.length) {
          this.setData({
            status: "answered",
            stream: finishAnswerStream(current, answer),
          });
          return;
        }
        const next = appendAnswerChunk(current, chunks[index]);
        index += 1;
        this.setData({ stream: next });
        this.typingTimer = clock.setTimeout(emitNext, 260);
      };
      this.typingTimer = clock.setTimeout(emitNext, 180);
    },
    clearTypingTimer() {
      if (!this.typingTimer) return;
      clock.clearTimeout(this.typingTimer);
      this.typingTimer = null;
    },
  });
}

function definePage<
  TData extends Record<string, unknown>,
  TCustom extends Record<string, unknown>,
>(options: TCustom & { data: TData } & ThisType<
  TCustom & { data: TData; setData(patch: Partial<TData>): void }
>): TCustom & { data: TData } {
  return options;
}

function readSubmitQuestion(event?: QaSubmitEvent): string | null {
  const question = event?.detail?.value?.question;
  return typeof question === "string" ? question : null;
}

function readConfirmQuestion(event: QaConfirmEvent): string | null {
  const question = event.detail?.value;
  return typeof question === "string" ? question : null;
}

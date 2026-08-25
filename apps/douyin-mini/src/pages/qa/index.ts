import type { DouyinAppContext } from "../../app";
import { askDecorationQuestion } from "../../api/qa";
import type { DouyinQaAnswer } from "../../models";
import { switchToTab } from "../../platform/navigation";

const PRESET_QUESTIONS = [
  "装修预算前要先准备哪些信息？",
  "旧房翻新要先看哪些地方？",
  "局部装修适合先确认什么？",
  "量房前需要准备什么？",
] as const;

type QaStatus = "idle" | "submitting" | "answered" | "failed";

Page({
  requestSequence: 0,
  data: {
    status: "idle" as QaStatus,
    question: "",
    answer: null as DouyinQaAnswer | null,
    presetQuestions: [...PRESET_QUESTIONS],
    errorMessage: "",
  },
  onLoad() {
    getApp<DouyinAppContext>().recordAnalytics("page_view");
  },
  onUnload() {
    this.requestSequence += 1;
  },
  onQuestionInput(event: { detail: { value?: string } }) {
    this.setData({ question: event.detail.value || "" });
  },
  onPresetTap(event: { currentTarget: { dataset: { question?: string } } }) {
    const question = event.currentTarget.dataset.question || "";
    this.setData({ question });
    void this.submit(question);
  },
  onSubmit() {
    void this.submit(this.data.question);
  },
  onSuggestedQuestionTap(event: { currentTarget: { dataset: { question?: string } } }) {
    const question = event.currentTarget.dataset.question || "";
    this.setData({ question });
    void this.submit(question);
  },
  onBookMeasurement() {
    void switchToTab("lead").catch(() => tt.showToast({
      title: "页面跳转失败，请重试",
      icon: "none",
    }));
  },
  async submit(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (question.length < 2) {
      tt.showToast({ title: "请输入想咨询的问题", icon: "none" });
      return;
    }
    if (question.length > 120) {
      tt.showToast({ title: "问题请控制在120字以内", icon: "none" });
      return;
    }
    const sequence = this.requestSequence + 1;
    this.requestSequence = sequence;
    this.setData({ status: "submitting", errorMessage: "", answer: null });
    try {
      const app = getApp<DouyinAppContext>();
      const answer = await askDecorationQuestion(app.api, {
        question,
        attribution: app.launchContext,
      });
      if (this.requestSequence !== sequence) return;
      this.setData({ status: "answered", answer });
    } catch {
      if (this.requestSequence !== sequence) return;
      this.setData({
        status: "failed",
        errorMessage: "暂时无法回答，请稍后重试或提交量房需求。",
      });
    }
  },
});

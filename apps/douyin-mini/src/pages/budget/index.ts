import type { DouyinAppContext } from "../../app";
import { createBudgetEstimate, fetchBudgetAiAnalysis, fetchBudgetConfig } from "../../api/budget";
import { resolveThemeColor } from "../../components/theme";
import type { DouyinBudgetEstimateResult, DouyinBudgetOptionCode, DouyinBudgetPublicConfig } from "../../models";
import { writeBudgetLeadContext } from "../../platform/budget-lead-context";
import { consumeBudgetResultReturnIntent } from "../../platform/measurement-success-context";
import { switchToTab } from "../../platform/navigation";
import { BudgetAiAnalysisRunner } from "./ai-polling";
import {
  BudgetFormValidationError, buildBudgetOptionViews, buildEstimateRequest,
  normalizeBudgetFormForConfig, reconcileSelectedOptions, updateBudgetSelection,
  type BudgetChoiceField, type BudgetFormValue, type BudgetOptionView,
} from "./form-model";
import {
  BudgetPageLifecycleCoordinator, applyBudgetFormMutation, beginAiRequest,
  beginBudgetCalculation, beginConfigLoad, buildBudgetPageView, createBudgetPageState,
  describeBudgetUnavailable, failAiRequest, failBudgetCalculation, failConfigLoad,
  invalidateBudgetPageRequests, markAiRequestUncertain, readBudgetError,
  resolveAiRequestResult, resolveBudgetCalculationResult, resolveConfigLoadResult,
  shouldPreserveBudgetResultOnReturn,
  type BudgetPageState,
} from "./page-model";
const INITIAL_FORM: BudgetFormValue = {
  areaText: "",
  propertyCondition: "rough",
  decorationTier: "comfortable",
  decorationScope: "whole_house",
  layout: "", style: "",
  selectedOptions: [], demand: "",
};
const CHOICE_FIELDS = new Set<BudgetChoiceField>(
  ["propertyCondition", "decorationTier", "decorationScope"],
);
const TEXT_FIELDS = new Set<"layout" | "style" | "demand">(["layout", "style", "demand"]);

Page({
  pageState: createBudgetPageState(),
  lifecycle: new BudgetPageLifecycleCoordinator(),
  aiPolling: new BudgetAiAnalysisRunner((estimateId, retry, timeoutMs) => (
    fetchBudgetAiAnalysis(getApp<DouyinAppContext>().api, estimateId, retry, timeoutMs)
  )),
  data: {
    status: "loading_config",
    primaryColor: "#191817",
    primaryTextColor: "#FFFFFF",
    activeChoiceStyle: "border-color: #191817; background-color: #191817; color: #FFFFFF;",
    config: null as DouyinBudgetPublicConfig | null,
    form: { ...INITIAL_FORM },
    applicableOptions: [] as BudgetOptionView[],
    areaError: "",
    pageError: "",
    unavailableTitle: "预算初算暂未开放",
    unavailableDescription: "装修公司尚未配置可用报价，请稍后再试。",
    estimate: null as DouyinBudgetEstimateResult | null,
    displayMinimum: "",
    displayMaximum: "",
    displayRange: "",
    resultPricingVersion: "",
    resultEffectivePeriod: "",
    categoryRows: [] as Array<DouyinBudgetEstimateResult["categories"][number] & { range: string }>,
    aiAnalysis: null as BudgetPageState["aiAnalysis"],
    aiError: "",
    aiRetryMode: "none" as BudgetPageState["aiRetryMode"],
  },
  onLoad() { if (this.lifecycle.onLoad()) void this.loadConfig(false); },
  onShow() {
    if (!this.lifecycle.onShow()) return;
    const estimateId = consumeBudgetResultReturnIntent();
    if (shouldPreserveBudgetResultOnReturn(this.pageState, estimateId)) {
      this.syncState();
      return;
    }
    void this.loadConfig(false);
  },
  onHide() { if (this.lifecycle.onHide()) this.suspendPage(); },
  onUnload() { this.lifecycle.onUnload(); this.suspendPage(); },
  onPullDownRefresh() { void this.loadConfig(true); },
  onRetryConfig() { void this.loadConfig(false); },
  suspendPage() {
    this.aiPolling.cancel();
    this.pageState = invalidateBudgetPageRequests(this.pageState);
  },
  async loadConfig(stopRefresh: boolean) {
    if (!this.lifecycle.isActive()) return;
    this.aiPolling.cancel();
    const pending = beginConfigLoad(this.pageState);
    this.pageState = pending;
    this.syncState();
    try {
      const app = getApp<DouyinAppContext>();
      const [bootstrap, config] = await Promise.all([
        app.bootstrap.getReadyOrLoad(),
        fetchBudgetConfig(app.api),
      ]);
      if (!bootstrap || !this.lifecycle.isActive()) return;
      const resolution = resolveConfigLoadResult(
        this.pageState, pending.configSequence, config,
      );
      if (!resolution.accepted) return;
      this.pageState = resolution.state;
      const acceptedConfig = resolution.state.config;
      if (!acceptedConfig) return;
      const theme = resolveThemeColor(bootstrap.theme.primary_color);
      const form = normalizeBudgetFormForConfig(acceptedConfig, this.data.form);
      this.setData({
        form,
        applicableOptions: buildBudgetOptionViews(acceptedConfig, form),
        primaryColor: theme.primaryColor,
        primaryTextColor: theme.primaryTextColor,
        activeChoiceStyle: `border-color: ${theme.primaryColor}; background-color: ${theme.primaryColor}; color: ${theme.primaryTextColor};`,
      });
      this.syncState();
      app.recordAnalytics("page_view");
    } catch (error) {
      if (!this.lifecycle.isActive()
        || pending.configSequence !== this.pageState.configSequence) return;
      const unavailable = describeBudgetUnavailable(error);
      this.pageState = failConfigLoad(
        this.pageState, pending.configSequence, unavailable.description,
      );
      this.setData({
        unavailableTitle: unavailable.title,
        unavailableDescription: unavailable.description,
      });
      this.syncState();
    } finally {
      if (stopRefresh) void tt.stopPullDownRefresh({});
    }
  },
  onAreaInput(event: { detail: { value?: string } }) {
    if (this.data.status === "calculating") return;
    const areaText = typeof event.detail.value === "string"
      ? event.detail.value.replace(/[^0-9.]/g, "").slice(0, 8)
      : "";
    this.commitFormMutation({ ...this.data.form, areaText }, { areaError: "" });
  },
  onTextInput(event: {
    currentTarget: { dataset: { field?: string } };
    detail: { value?: string };
  }) {
    if (this.data.status === "calculating") return;
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value;
    if (!TEXT_FIELDS.has(field as "layout" | "style" | "demand")
      || typeof value !== "string") return;
    const textField = field as "layout" | "style" | "demand";
    const maximum = textField === "demand" ? 1_000 : 40;
    this.commitFormMutation({
      ...this.data.form,
      [textField]: value.slice(0, maximum),
    });
  },
  onSelectChoice(event: {
    currentTarget: { dataset: { field?: string; value?: string } };
  }) {
    if (this.data.status === "calculating" || !this.data.config) return;
    const { field, value } = event.currentTarget.dataset;
    if (!CHOICE_FIELDS.has(field as BudgetChoiceField) || typeof value !== "string") return;
    const form = updateBudgetSelection(
      this.data.config, this.data.form, field as BudgetChoiceField, value,
    );
    this.commitFormMutation(form);
  },
  onToggleOption(event: { currentTarget: { dataset: { code?: string } } }) {
    if (this.data.status === "calculating" || !this.data.config) return;
    const code = event.currentTarget.dataset.code as DouyinBudgetOptionCode;
    if (!this.data.applicableOptions.some((option) => option.code === code)) return;
    const selectedOptions = this.data.form.selectedOptions.includes(code)
      ? this.data.form.selectedOptions.filter((item) => item !== code)
      : [...this.data.form.selectedOptions, code];
    const form = { ...this.data.form, selectedOptions };
    this.commitFormMutation(form);
  },
  commitFormMutation(form: BudgetFormValue, fields: { areaError?: string } = {}) {
    this.aiPolling.cancel();
    this.pageState = applyBudgetFormMutation(this.pageState);
    this.setData({
      form,
      applicableOptions: this.data.config ? buildBudgetOptionViews(this.data.config, form) : [],
      ...fields,
    });
    this.syncState();
  },
  async onCalculate() {
    if (!this.lifecycle.isActive() || !this.data.config
      || this.data.status === "calculating") return;
    let request;
    try {
      const form = {
        ...this.data.form,
        selectedOptions: reconcileSelectedOptions(this.data.config, this.data.form),
      };
      request = buildEstimateRequest(form);
      this.setData({ form, areaError: "", pageError: "" });
    } catch (error) {
      if (error instanceof BudgetFormValidationError) {
        this.setData({
          areaError: error.field === "areaText" ? error.message : "",
          pageError: error.message,
        });
      }
      return;
    }
    this.aiPolling.cancel();
    const pending = beginBudgetCalculation(this.pageState);
    this.pageState = pending.state;
    this.syncState();
    try {
      const estimate = await createBudgetEstimate(getApp<DouyinAppContext>().api, request);
      if (!this.lifecycle.isActive()) return;
      const resolution = resolveBudgetCalculationResult(
        this.pageState, pending.sequence, estimate,
      );
      if (!resolution.accepted) return;
      this.pageState = resolution.state;
      this.syncState();
      this.loadAi(estimate.id, false);
    } catch (error) {
      if (!this.lifecycle.isActive()
        || pending.sequence !== this.pageState.calculationSequence) return;
      this.pageState = failBudgetCalculation(
        this.pageState,
        pending.sequence,
        readBudgetError(error, "预算计算失败，请稍后重试"),
      );
      this.syncState();
    }
  },
  onRetryAi() {
    const id = this.pageState.estimate?.id;
    if (id && this.lifecycle.isActive()) {
      this.loadAi(id, this.pageState.aiRetryMode === "retry");
    }
  },
  loadAi(estimateId: string, retry: boolean) {
    if (!this.lifecycle.isActive() || this.pageState.estimate?.id !== estimateId) return;
    const pending = beginAiRequest(this.pageState);
    this.pageState = pending.state;
    this.syncState();
    this.aiPolling.start(estimateId, retry, {
      onResponse: (response) => {
        if (!this.lifecycle.isActive()) return;
        const resolution = resolveAiRequestResult(
          this.pageState, pending.sequence, estimateId, response,
        );
        if (!resolution.accepted) return;
        this.pageState = resolution.state;
        this.syncState();
      },
      onUncertain: () => {
        if (!this.lifecycle.isActive()) return;
        this.pageState = markAiRequestUncertain(
          this.pageState,
          pending.sequence,
          estimateId,
          "AI 说明仍在生成，正在自动获取结果。",
        );
        this.syncState();
      },
      onExhausted: () => {
        if (!this.lifecycle.isActive()) return;
        this.pageState = failAiRequest(
          this.pageState,
          pending.sequence,
          estimateId,
          "AI 说明暂未完成，规则预算仍可正常使用。",
        );
        this.syncState();
      },
    });
  },
  onBookMeasurement() {
    const estimate = this.pageState.estimate;
    if (!estimate || !this.lifecycle.isActive()) return;
    const stored = writeBudgetLeadContext({
      estimateId: estimate.id,
      estimateNo: estimate.estimate_no,
      displayRange: buildBudgetPageView(this.pageState).displayRange,
      storedAt: Date.now(),
    });
    if (!stored) {
      void tt.showToast({ title: "预算信息保存失败，请稍后重试", icon: "none" });
      return;
    }
    void switchToTab("lead")
      .catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
  },
  syncState() {
    if (this.lifecycle.isActive()) this.setData(buildBudgetPageView(this.pageState));
  },
});

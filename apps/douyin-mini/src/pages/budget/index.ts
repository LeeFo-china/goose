import type { DouyinAppContext } from "../../app";
import {
  createBudgetEstimate,
  fetchBudgetAiAnalysis,
  fetchBudgetConfig,
} from "../../api/budget";
import { ApiRequestError } from "../../api/request";
import { resolveThemeColor } from "../../components/theme";
import type {
  DouyinBudgetEstimateResult,
  DouyinBudgetOptionCode,
  DouyinBudgetPublicConfig,
  DouyinBudgetPublicOption,
} from "../../models";
import { writeBudgetLeadContext } from "../../platform/budget-lead-context";
import { switchToTab } from "../../platform/navigation";
import {
  BudgetFormValidationError,
  buildEstimateRequest,
  filterApplicableOptions,
  reconcileSelectedOptions,
  updateBudgetSelection,
  type BudgetChoiceField,
  type BudgetFormValue,
} from "./form-model";
import {
  beginAiRequest,
  beginBudgetCalculation,
  beginConfigLoad,
  createBudgetPageState,
  failAiRequest,
  failBudgetCalculation,
  failConfigLoad,
  resolveAiRequest,
  resolveBudgetCalculation,
  resolveConfigLoad,
  type BudgetPageState,
} from "./page-model";

const INITIAL_FORM: BudgetFormValue = {
  areaText: "",
  propertyCondition: "rough",
  decorationTier: "comfortable",
  decorationScope: "whole_house",
  layout: "",
  style: "",
  selectedOptions: [],
  demand: "",
};
const CHOICE_FIELDS = new Set<BudgetChoiceField>([
  "propertyCondition", "decorationTier", "decorationScope",
]);
const TEXT_FIELDS = new Set<"layout" | "style" | "demand">(["layout", "style", "demand"]);
type BudgetOptionView = DouyinBudgetPublicOption & { selected: boolean };

Page({
  pageState: createBudgetPageState(),
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
    categoryRows: [] as Array<DouyinBudgetEstimateResult["categories"][number] & { range: string }>,
    aiAnalysis: null as BudgetPageState["aiAnalysis"],
    aiError: "",
  },
  onLoad() { void this.loadConfig(false); },
  onPullDownRefresh() { void this.loadConfig(true); },
  onRetryConfig() { void this.loadConfig(false); },
  async loadConfig(stopRefresh: boolean) {
    const pending = beginConfigLoad(this.pageState);
    this.pageState = pending;
    this.syncState();
    try {
      const app = getApp<DouyinAppContext>();
      const [bootstrap, config] = await Promise.all([
        app.bootstrap.getReadyOrLoad(),
        fetchBudgetConfig(app.api),
      ]);
      if (!bootstrap) return;
      const theme = resolveThemeColor(bootstrap.theme.primary_color);
      this.pageState = resolveConfigLoad(
        this.pageState,
        pending.configSequence,
        config,
      );
      const form = normalizeFormForConfig(this.data.form, config);
      this.setData({
        form,
        applicableOptions: buildOptionViews(config, form),
        primaryColor: theme.primaryColor,
        primaryTextColor: theme.primaryTextColor,
        activeChoiceStyle: `border-color: ${theme.primaryColor}; background-color: ${theme.primaryColor}; color: ${theme.primaryTextColor};`,
      });
      this.syncState();
      app.recordAnalytics("page_view");
    } catch (error) {
      const unavailable = describeUnavailable(error);
      this.pageState = failConfigLoad(
        this.pageState,
        pending.configSequence,
        unavailable.description,
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
    this.setData({
      form: { ...this.data.form, areaText },
      areaError: "",
      pageError: "",
    });
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
    this.setData({
      form: { ...this.data.form, [textField]: value.slice(0, maximum) },
      pageError: "",
    });
  },
  onSelectChoice(event: {
    currentTarget: { dataset: { field?: string; value?: string } };
  }) {
    if (this.data.status === "calculating" || !this.data.config) return;
    const { field, value } = event.currentTarget.dataset;
    if (!CHOICE_FIELDS.has(field as BudgetChoiceField) || typeof value !== "string") return;
    const form = updateBudgetSelection(
      this.data.config,
      this.data.form,
      field as BudgetChoiceField,
      value,
    );
    this.setData({
      form,
      applicableOptions: buildOptionViews(this.data.config, form),
      pageError: "",
    });
  },
  onToggleOption(event: { currentTarget: { dataset: { code?: string } } }) {
    if (this.data.status === "calculating" || !this.data.config) return;
    const code = event.currentTarget.dataset.code as DouyinBudgetOptionCode;
    if (!this.data.applicableOptions.some((option) => option.code === code)) return;
    const selectedOptions = this.data.form.selectedOptions.includes(code)
      ? this.data.form.selectedOptions.filter((item) => item !== code)
      : [...this.data.form.selectedOptions, code];
    const form = { ...this.data.form, selectedOptions };
    this.setData({
      form,
      applicableOptions: buildOptionViews(this.data.config, form),
      pageError: "",
    });
  },
  async onCalculate() {
    if (!this.data.config || this.data.status === "calculating") return;
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
    const pending = beginBudgetCalculation(this.pageState);
    this.pageState = pending.state;
    this.syncState();
    try {
      const estimate = await createBudgetEstimate(getApp<DouyinAppContext>().api, request);
      this.pageState = resolveBudgetCalculation(
        this.pageState,
        pending.sequence,
        estimate,
      );
      this.syncState();
      if (this.pageState.estimate?.id === estimate.id) void this.loadAi(estimate.id, false);
    } catch (error) {
      this.pageState = failBudgetCalculation(
        this.pageState,
        pending.sequence,
        readableError(error, "预算计算失败，请稍后重试"),
      );
      this.syncState();
    }
  },
  onRetryAi() {
    const id = this.pageState.estimate?.id;
    if (id) void this.loadAi(id, true);
  },
  async loadAi(estimateId: string, retry: boolean) {
    const pending = beginAiRequest(this.pageState);
    this.pageState = pending.state;
    this.syncState();
    try {
      const response = await fetchBudgetAiAnalysis(
        getApp<DouyinAppContext>().api,
        estimateId,
        retry,
      );
      this.pageState = resolveAiRequest(
        this.pageState,
        pending.sequence,
        estimateId,
        response,
      );
    } catch (error) {
      this.pageState = failAiRequest(
        this.pageState,
        pending.sequence,
        estimateId,
        readableError(error, "AI 建议暂时无法生成"),
      );
    }
    this.syncState();
  },
  onBookMeasurement() {
    const estimate = this.pageState.estimate;
    if (!estimate) return;
    try {
      writeBudgetLeadContext({
        estimateId: estimate.id,
        estimateNo: estimate.estimate_no,
        displayRange: formatRange(estimate.minimum_total, estimate.maximum_total),
        storedAt: Date.now(),
      });
    } catch {
      void tt.showToast({ title: "预算信息保存失败，请稍后重试", icon: "none" });
      return;
    }
    void switchToTab("lead")
      .catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
  },
  syncState() {
    const estimate = this.pageState.estimate;
    this.setData({
      status: this.pageState.status,
      config: this.pageState.config,
      pageError: this.pageState.pageError,
      estimate,
      displayMinimum: estimate ? formatMoney(estimate.minimum_total) : "",
      displayMaximum: estimate ? formatMoney(estimate.maximum_total) : "",
      displayRange: estimate ? formatRange(estimate.minimum_total, estimate.maximum_total) : "",
      categoryRows: estimate?.categories.map((category) => ({
        ...category,
        range: formatRange(category.minimum_amount, category.maximum_amount),
      })) ?? [],
      aiAnalysis: this.pageState.aiAnalysis,
      aiError: this.pageState.aiError,
    });
  },
});

function normalizeFormForConfig(
  form: BudgetFormValue,
  config: DouyinBudgetPublicConfig,
): BudgetFormValue {
  const normalized = {
    ...form,
    propertyCondition: config.property_conditions.some((item) => item.value === form.propertyCondition)
      ? form.propertyCondition : config.property_conditions[0]!.value,
    decorationTier: config.decoration_tiers.some((item) => item.value === form.decorationTier)
      ? form.decorationTier : config.decoration_tiers[0]!.value,
    decorationScope: config.decoration_scopes.some((item) => item.value === form.decorationScope)
      ? form.decorationScope : config.decoration_scopes[0]!.value,
  };
  return { ...normalized, selectedOptions: reconcileSelectedOptions(config, normalized) };
}

function buildOptionViews(
  config: DouyinBudgetPublicConfig,
  form: BudgetFormValue,
): BudgetOptionView[] {
  const selected = new Set(form.selectedOptions);
  return filterApplicableOptions(config, form).map((option) => ({
    ...option,
    selected: selected.has(option.code),
  }));
}

function formatMoney(amount: number): string {
  return `¥${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function formatRange(minimum: number, maximum: number): string {
  return `${formatMoney(minimum)} - ${formatMoney(maximum)}`;
}

function describeUnavailable(error: unknown) {
  return error instanceof ApiRequestError && error.code === "DOUYIN_BUDGET_NOT_CONFIGURED"
    ? { title: "预算初算暂未开放", description: "装修公司尚未配置可用报价，请稍后再试。" }
    : { title: "预算初算暂时无法加载", description: readableError(error, "请检查网络后重试。") };
}

function readableError(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError && error.message.trim() ? error.message : fallback;
}

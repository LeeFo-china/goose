Component({
  properties: {
    value: { type: Object, value: {} },
    companyName: { type: String, value: "装修服务提供方" },
    primaryColor: { type: String, value: "#191817" },
    primaryTextColor: { type: String, value: "#FFFFFF" },
    phoneReady: { type: Boolean, value: false },
    smsSending: { type: Boolean, value: false },
    smsCooldown: { type: Number, value: 0 },
    consented: { type: Boolean, value: false },
    submitting: { type: Boolean, value: false },
    fieldErrors: { type: Object, value: {} },
    focusedField: { type: String, value: "" },
    optionalDetailsExpanded: { type: Boolean, value: false },
    minVisitDate: { type: String, value: "" },
    hasLinkedEstimate: { type: Boolean, value: false },
    estimateNo: { type: String, value: "" },
    estimateRange: { type: String, value: "" },
    douyinClueEnabled: { type: Boolean, value: false },
    douyinClueComponentId: { type: String, value: "" },
  },
  methods: {
    onInput(event: { currentTarget: { dataset: { field?: string } }; detail: { value: string } }) {
      if (this.data.submitting) return;
      const field = event.currentTarget.dataset.field;
      if (field) this.triggerEvent("fieldchange", { field, value: event.detail.value });
    },
    onSmsCodeChange(event: { detail: { value: string } }) {
      if (this.data.submitting) return;
      this.triggerEvent("fieldchange", { field: "sms_code", value: event.detail.value });
    },
    onVisitDateChange(event: { detail: { value?: string } }) {
      if (this.data.submitting || typeof event.detail.value !== "string") return;
      this.triggerEvent("fieldchange", {
        field: "preferred_visit_date",
        value: event.detail.value,
      });
    },
    onVisitPeriodChange(event: {
      currentTarget: { dataset: { period?: string } };
    }) {
      if (this.data.submitting) return;
      const period = event.currentTarget.dataset.period;
      if (period) this.triggerEvent("fieldchange", {
        field: "preferred_visit_period",
        value: period,
      });
    },
    onSendSms() {
      if (!this.data.submitting) this.triggerEvent("sendsms");
    },
    onConsentChange(event: { detail: { checked: boolean } }) {
      if (this.data.submitting) return;
      this.triggerEvent("consentchange", event.detail);
    },
    onOpenPolicy() { this.triggerEvent("openpolicy"); },
    onToggleOptionalDetails() {
      if (!this.data.submitting) this.triggerEvent("toggleoptional");
    },
    onSubmit() {
      if (!this.data.submitting) this.triggerEvent("submit");
    },
    onDouyinPhoneNumber(event: { detail?: { code?: string } }) {
      if (this.data.submitting) return;
      this.triggerEvent("submit", {
        douyin_phone_code: typeof event.detail?.code === "string"
          ? event.detail.code
          : "",
      });
    },
  },
});

Component({
  properties: {
    checked: { type: Boolean, value: false },
    companyName: { type: String, value: "装修服务提供方" },
    disabled: { type: Boolean, value: false },
  },
  methods: {
    onToggle() {
      if (!this.data.disabled) this.triggerEvent("change", { checked: !this.data.checked });
    },
    onOpenPolicy() {
      if (!this.data.disabled) this.triggerEvent("openpolicy");
    },
  },
});

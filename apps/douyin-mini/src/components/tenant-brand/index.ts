Component({
  data: { logoFailed: false },
  properties: {
    name: { type: String, value: "装修服务" },
    city: { type: String, value: "" },
    logoUrl: { type: String, value: "" },
    primaryColor: { type: String, value: "#191817" },
    primaryTextColor: { type: String, value: "#FFFFFF" },
    loading: { type: Boolean, value: false },
  },
  observers: {
    logoUrl() { this.setData({ logoFailed: false }); },
  },
  methods: {
    onLogoError() {
      this.setData({ logoFailed: true });
      this.triggerEvent("imageerror");
    },
  },
});

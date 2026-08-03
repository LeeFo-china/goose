Component({
  properties: {
    value: { type: String, value: "" },
    phoneReady: { type: Boolean, value: false },
    sending: { type: Boolean, value: false },
    cooldown: { type: Number, value: 0 },
    focused: { type: Boolean, value: false },
    error: { type: String, value: "" },
    primaryColor: { type: String, value: "#191817" },
  },
  methods: {
    onInput(event: { detail: { value: string } }) {
      if (!this.data.sending) this.triggerEvent("change", { value: event.detail.value });
    },
    onSend() {
      if (this.data.phoneReady && !this.data.sending && this.data.cooldown <= 0) {
        this.triggerEvent("send");
      }
    },
  },
});

Component({
  properties: {
    item: { type: Object, value: {} },
  },
  methods: {
    onSelect() {
      if (typeof this.data.item.id !== "string") return;
      this.triggerEvent("select", {
        id: this.data.item.id,
        ...(typeof this.data.item.claim_id === "string"
          ? { claimId: this.data.item.claim_id }
          : {}),
      });
    },
  },
});

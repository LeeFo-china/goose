Component({
  data: { skeletonItems: [1, 2, 3] },
  properties: {
    items: { type: Array, value: [] },
    loading: { type: Boolean, value: false },
    error: { type: Boolean, value: false },
  },
});

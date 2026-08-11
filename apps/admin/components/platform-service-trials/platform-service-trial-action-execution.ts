type TrialMutationFlowInput<Detail> = {
  mutate: () => Promise<void>;
  refreshList: () => void;
  onMutationSucceeded: () => void;
  loadDetail: () => Promise<Detail>;
  updateDetail: (detail: Detail) => void;
};

export async function runTrialMutationFlow<Detail>({
  mutate,
  refreshList,
  onMutationSucceeded,
  loadDetail,
  updateDetail,
}: TrialMutationFlowInput<Detail>) {
  await mutate();
  refreshList();
  onMutationSucceeded();

  try {
    const detail = await loadDetail();
    updateDetail(detail);
    return { detailRefreshError: null };
  } catch (caught) {
    return { detailRefreshError: caught };
  }
}

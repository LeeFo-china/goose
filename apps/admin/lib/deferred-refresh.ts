type RefreshableRouter = {
  refresh: () => void;
};

const DEFAULT_DIALOG_CLOSE_DELAY_MS = 180;

export function refreshAfterDialogClose(
  router: RefreshableRouter,
  delayMs = DEFAULT_DIALOG_CLOSE_DELAY_MS,
) {
  window.setTimeout(() => {
    router.refresh();
  }, delayMs);
}

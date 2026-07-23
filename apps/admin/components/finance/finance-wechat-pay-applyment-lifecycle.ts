type MutableMountedRef = {
  current: boolean;
};

type PageTransitionLike = {
  persisted: boolean;
};

export function createApplymentAutosavePageLifecycle(input: {
  mountedRef: MutableMountedRef;
  flush: () => Promise<void>;
  detach: () => Promise<void>;
  restore: () => void;
}) {
  let detached = false;

  async function detachRuntime(): Promise<void> {
    if (detached) return;
    detached = true;
    input.mountedRef.current = false;
    await input.detach();
  }

  return {
    mount(): void {
      input.mountedRef.current = true;
    },
    async pageHide(event: PageTransitionLike): Promise<void> {
      if (detached) return;
      if (event.persisted) {
        await input.flush();
        return;
      }
      await detachRuntime();
    },
    pageShow(event: PageTransitionLike): void {
      if (detached || !event.persisted) return;
      input.mountedRef.current = true;
      input.restore();
    },
    unmount: detachRuntime,
  };
}

export function setupMountedRefLifecycle(
  mountedRef: MutableMountedRef,
  onCleanup: () => void,
) {
  mountedRef.current = true;
  return () => {
    mountedRef.current = false;
    onCleanup();
  };
}

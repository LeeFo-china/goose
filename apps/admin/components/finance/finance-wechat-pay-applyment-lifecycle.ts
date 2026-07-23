type MutableMountedRef = {
  current: boolean;
};

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

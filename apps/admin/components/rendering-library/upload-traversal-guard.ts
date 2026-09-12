// The installed TypeScript DOM library lacks Navigation; this minimal port follows
// https://github.com/WICG/navigation-api (navigate, destination.key, traverseTo).
interface TraversalNavigation extends EventTarget {
  traverseTo(key: string): { committed: Promise<unknown>; finished: Promise<unknown> };
}
interface TraversalEvent extends Event {
  navigationType: 'traverse';
  destination: { sameDocument: true; key: string };
}
function supportsNavigation(value: unknown): value is TraversalNavigation {
  return value instanceof EventTarget && 'traverseTo' in value && typeof value.traverseTo === 'function';
}
function isCancelableTraversal(event: Event): event is TraversalEvent {
  if (!event.cancelable || !('navigationType' in event) || event.navigationType !== 'traverse' || !('destination' in event)) return false;
  const destination = event.destination;
  return Boolean(destination && typeof destination === 'object' && 'sameDocument' in destination && destination.sameDocument === true
    && 'key' in destination && typeof destination.key === 'string' && destination.key);
}

export function installUploadTraversalGuard({ navigation, shouldBlock, onBlocked }: {
  navigation: unknown; shouldBlock: () => boolean; onBlocked: (proceed: () => Promise<void>) => void;
}): { supported: boolean; dispose: () => void } {
  if (!supportsNavigation(navigation)) return { supported: false, dispose: () => {} };
  const navigate = (event: Event) => {
    // Browsers deliberately permit some traversals to escape cancellation. Do not
    // trap them with popstate/history restoration; cross-document uses beforeunload.
    if (!shouldBlock() || !isCancelableTraversal(event)) return;
    event.preventDefault();
    const key = event.destination.key;
    onBlocked(async () => {
      const result = navigation.traverseTo(key);
      await Promise.all([result.committed, result.finished]);
    });
  };
  navigation.addEventListener('navigate', navigate);
  return { supported: true, dispose: () => navigation.removeEventListener('navigate', navigate) };
}

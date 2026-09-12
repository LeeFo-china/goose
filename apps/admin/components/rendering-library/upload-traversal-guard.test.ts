import { expect, test } from 'bun:test';
import { installUploadTraversalGuard } from './upload-traversal-guard';

class NavigationFixture extends EventTarget {
  calls: string[] = [];
  failure = false;
  traverseTo(key: string) {
    this.calls.push(key);
    return { committed: Promise.resolve(), finished: this.failure ? Promise.reject(new DOMException('Navigation failed', 'AbortError')) : Promise.resolve() };
  }
}
function traversal(cancelable = true, sameDocument = true) {
  return Object.assign(new Event('navigate', { cancelable }), { navigationType: 'traverse', destination: { sameDocument, key: 'previous-entry' } });
}

test('supported traversal cancels before leaving, keeps the queue on cancel, and resumes only after explicit confirmation', async () => {
  const navigation = new NavigationFixture();
  let proceed: (() => Promise<void>) | undefined;
  const guard = installUploadTraversalGuard({ navigation, shouldBlock: () => true, onBlocked: (resume) => { proceed = resume; } });
  const event = traversal(); navigation.dispatchEvent(event);
  expect(guard.supported).toBe(true); expect(event.defaultPrevented).toBe(true); expect(navigation.calls).toEqual([]);
  await proceed?.(); expect(navigation.calls).toEqual(['previous-entry']);
  guard.dispose(); const next = traversal(); navigation.dispatchEvent(next); expect(next.defaultPrevented).toBe(false);
});

test('unsupported navigation and uncancelable or cross-document traversal are not trapped', () => {
  let blocked = 0;
  const callbacks = { shouldBlock: () => true, onBlocked: () => { blocked += 1; } };
  expect(installUploadTraversalGuard({ ...callbacks, navigation: undefined }).supported).toBe(false);
  const navigation = new NavigationFixture();
  const guard = installUploadTraversalGuard({ ...callbacks, navigation });
  for (const event of [traversal(false), traversal(true, false)]) { navigation.dispatchEvent(event); expect(event.defaultPrevented).toBe(false); }
  expect(blocked).toBe(0); guard.dispose();
});

test('clean queues are not intercepted and confirmation failures propagate for visible recovery', async () => {
  const navigation = new NavigationFixture(); let dirty = false; let proceed: (() => Promise<void>) | undefined;
  const guard = installUploadTraversalGuard({ navigation, shouldBlock: () => dirty, onBlocked: (resume) => { proceed = resume; } });
  const clean = traversal(); navigation.dispatchEvent(clean); expect(clean.defaultPrevented).toBe(false);
  dirty = true; navigation.failure = true; navigation.dispatchEvent(traversal());
  expect(proceed).toBeDefined(); await expect(proceed!()).rejects.toMatchObject({ name: 'AbortError' });
  guard.dispose();
});

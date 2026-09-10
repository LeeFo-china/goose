import { expect, test } from 'bun:test';
import { installStocktakeLeaveGuard } from './stocktake-editor-guard';
test('未保存编辑拦截刷新与同窗口链接；清理后恢复导航', () => {
  const page = new EventTarget();
  const document = new EventTarget();
  const destinations: string[] = [];
  const cleanup = installStocktakeLeaveGuard({
    page,
    document,
    currentUrl: () => 'https://admin.test/warehouse-stocktakes',
    onLeave: (href) => destinations.push(href),
  });
  const unload = new Event('beforeunload', { cancelable: true });
  page.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  function click(target: string) {
    const event = new Event('click', { cancelable: true });
    Object.defineProperties(event, {
      button: { value: 0 },
      target: {
        value: {
          closest: () => ({ href: 'https://admin.test/inventory', target, hasAttribute: () => false }),
        },
      },
    });
    document.dispatchEvent(event);
    return event;
  }
  expect(click('_self').defaultPrevented).toBe(true);
  expect(destinations).toEqual(['https://admin.test/inventory']);
  expect(click('_blank').defaultPrevented).toBe(false);
  cleanup();
  const after = new Event('beforeunload', { cancelable: true });
  page.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
  expect(click('_self').defaultPrevented).toBe(false);
});

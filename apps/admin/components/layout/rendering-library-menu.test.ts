import { expect, test } from 'bun:test';
import { tenantNavGroups } from './menu-config';
test('private rendering library follows marketing and requires read all without platform bypass', () => {
  const items = tenantNavGroups.find((group) => group.label === '业务')!.items;
  const marketing = items.findIndex((item) => item.href === '/marketing');
  expect(items[marketing + 1]).toMatchObject({ href: '/rendering-library', label: '装修效果库',
    requiredPermissions: [{ code: 'rendering_library.read', scope: 'all' }], allowPlatformAdminPermissionBypass: false });
});

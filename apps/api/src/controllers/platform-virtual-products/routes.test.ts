import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const controllerUrl = new URL('./index.ts', import.meta.url);
const routesUrl = new URL('../../routes/index.ts', import.meta.url);

describe('PlatformVirtualProductsController routes', () => {
  test('registers the explicit platform virtual product routes', () => {
    const controller = readFileSync(controllerUrl, 'utf8');
    const routes = readFileSync(routesUrl, 'utf8');

    for (const route of [
      "@Get('/platform/virtual-products')",
      "@Post('/platform/virtual-products')",
      "@Get('/platform/virtual-products/:id')",
      "@Patch('/platform/virtual-products/:id')",
      "@Post('/platform/virtual-products/:id/activate')",
      "@Post('/platform/virtual-products/:id/suspend')",
      "@Post('/platform/virtual-products/:id/archive')",
      "@Get('/platform/virtual-products/:id/channel-mappings/:environment')",
      "@Post('/platform/virtual-products/:id/channel-mappings/:environment/goods/upload')",
      "@Post('/platform/virtual-products/:id/channel-mappings/:environment/goods/publish')",
      "@Post('/platform/virtual-products/:id/channel-mappings/:environment/validate')",
    ]) {
      expect(controller).toContain(route);
    }
    expect(routes).toContain(
      'import PlatformVirtualProductsController from "@/controllers/platform-virtual-products";',
    );
    expect(routes).toContain(
      'PlatformVirtualProductsController.registerExtraRoutes(app);',
    );
  });
});

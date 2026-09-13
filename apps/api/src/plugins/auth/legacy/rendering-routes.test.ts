import { expect, test } from 'bun:test';
import { isRenderingUploadsRoute } from './rendering-routes';
import { isVisitorSessionRoute, isPublicRoute } from './routes';

test.each(['visitor', 'douyin-mini'] as const)('upload access is exact POST only in %s scope', (scope) => {
  const prefix = `/${scope}/renderings/uploads`;
  for (const url of [prefix + ':intent', prefix + '/invalid/complete']) {
    expect(isRenderingUploadsRoute('POST', url, scope)).toBe(true);
    expect(isPublicRoute('POST', url)).toBe(false);
    if (scope === 'visitor') expect(isVisitorSessionRoute('POST', url)).toBe(true);
    for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) expect(isRenderingUploadsRoute(method, url, scope)).toBe(false);
  }
  for (const url of ['/upload', prefix, prefix + ':intent/extra', prefix + '/id/complete/extra', prefix + '//complete', prefix + '/id/other']) {
    expect(isRenderingUploadsRoute('POST', url, scope)).toBe(false);
  }
});

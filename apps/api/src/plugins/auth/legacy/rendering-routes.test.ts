import { expect, test } from 'bun:test';
import { isRenderingJobsCreateRoute, isRenderingJobsReadRoute, isRenderingUploadsRoute } from './rendering-routes';
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

test.each(['visitor', 'douyin-mini'] as const)('job detail remains session-scoped in %s scope', (scope) => {
  const collection = `/${scope}/renderings/jobs`;
  const url = `${collection}/11111111-1111-4111-8111-111111111111`;
  for (const method of ['GET', 'HEAD']) {
    expect(isRenderingJobsReadRoute(method, url, scope)).toBe(true);
    expect(isPublicRoute(method, url)).toBe(false);
    if (scope === 'visitor') expect(isVisitorSessionRoute(method, url)).toBe(true);
  }
  for (const method of ['POST', 'PUT', 'DELETE']) expect(isRenderingJobsReadRoute(method, url, scope)).toBe(false);
  for (const path of [collection, `${collection}/`, `${url}/extra`, `${url}/`]) {
    expect(isRenderingJobsReadRoute('GET', path, scope)).toBe(false);
  }
});

test.each(['visitor', 'douyin-mini'] as const)('upload status read is exact GET and HEAD only in %s scope', (scope) => {
  const prefix = `/${scope}/renderings/uploads`;
  const url = `${prefix}/11111111-1111-4111-8111-111111111111`;
  for (const method of ['GET', 'HEAD']) {
    expect(isRenderingUploadsRoute(method, url, scope)).toBe(true);
    expect(isPublicRoute(method, url)).toBe(false);
    if (scope === 'visitor') expect(isVisitorSessionRoute(method, url)).toBe(true);
  }
  for (const method of ['POST', 'PUT', 'DELETE']) expect(isRenderingUploadsRoute(method, url, scope)).toBe(false);
  for (const path of [prefix, `${prefix}/`, `${url}/extra`, `${url}/`, `${prefix}//`]) {
    expect(isRenderingUploadsRoute('GET', path, scope)).toBe(false);
  }
});

test.each(['visitor', 'douyin-mini'] as const)('job create auth route is exact POST only in %s scope', (scope) => {
  const url = `/${scope}/renderings/jobs`;
  expect(isRenderingJobsCreateRoute('POST', url, scope)).toBe(true);
  expect(isPublicRoute('POST', url)).toBe(false);
  if (scope === 'visitor') expect(isVisitorSessionRoute('POST', url)).toBe(true);
  for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) {
    expect(isRenderingJobsCreateRoute(method, url, scope)).toBe(false);
  }
  for (const path of [`${url}/`, `${url}/another`, `${url}:retry`]) {
    expect(isRenderingJobsCreateRoute('POST', path, scope)).toBe(false);
  }
});

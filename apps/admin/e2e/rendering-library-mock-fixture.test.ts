import { expect, test } from 'bun:test';
import { RenderingLibraryStyleSchema } from '@gooes/domain';
// The browser mock must preserve the actual shared response contract.
import { initialStyles } from './rendering-library-mock-fixture.mjs';

test('browser fixture uses valid rendering style DTOs for two pages', () => {
  const rows: unknown[] = initialStyles();
  expect(rows).toHaveLength(21);
  for (const row of rows) expect(RenderingLibraryStyleSchema.safeParse(row).success).toBe(true);
});

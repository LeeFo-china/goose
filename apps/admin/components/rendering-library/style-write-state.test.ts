import { expect, test } from 'bun:test';
import { LibraryRequestError } from './requests';
import { getStyleWriteBlock } from './style-write-state';

test('conflicts require an explicit reload and unavailable records cannot be submitted again', () => {
  expect(getStyleWriteBlock(new LibraryRequestError('conflict', 'CONFLICT', 409))).toBe('conflict');
  expect(getStyleWriteBlock(new LibraryRequestError('missing', 'NOT_FOUND', 404))).toBe('unavailable');
  expect(getStyleWriteBlock(new LibraryRequestError('temporary', 'FAILED', 500))).toBeUndefined();
});

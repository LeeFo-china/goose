import { LibraryRequestError } from './requests';

export function getStyleWriteBlock(error: unknown): 'conflict' | 'unavailable' | undefined {
  if (!(error instanceof LibraryRequestError)) return undefined;
  if (error.status === 404) return 'unavailable';
  if (error.status === 409) return 'conflict';
  return undefined;
}

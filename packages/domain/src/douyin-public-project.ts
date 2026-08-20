export const DOUYIN_PROJECT_PHASE_VALUES = [
  'in_progress',
  'completed',
] as const;
export type DouyinProjectPhase = (typeof DOUYIN_PROJECT_PHASE_VALUES)[number];

export const DOUYIN_PROJECT_PUBLICATION_STATUS_VALUES = [
  'draft',
  'published',
  'hidden',
] as const;
export type DouyinProjectPublicationStatus =
  (typeof DOUYIN_PROJECT_PUBLICATION_STATUS_VALUES)[number];

export function toDouyinProjectPhase(
  status: string | null | undefined,
): DouyinProjectPhase | null {
  if (status === 'started' || status === 'constructing') return 'in_progress';
  if (status === 'acceptance') return 'completed';
  return null;
}

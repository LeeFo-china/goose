import { describe, expect, test } from 'bun:test';
import {
  DOUYIN_PROJECT_PHASE_VALUES,
  DOUYIN_PROJECT_PUBLICATION_STATUS_VALUES,
  toDouyinProjectPhase,
} from './douyin-public-project';

describe('douyin public project', () => {
  test('maps only public lifecycle phases', () => {
    expect(DOUYIN_PROJECT_PHASE_VALUES).toEqual(['in_progress', 'completed']);
    expect(DOUYIN_PROJECT_PUBLICATION_STATUS_VALUES).toEqual([
      'draft',
      'published',
      'hidden',
    ]);
    expect(toDouyinProjectPhase('started')).toBe('in_progress');
    expect(toDouyinProjectPhase('constructing')).toBe('in_progress');
    expect(toDouyinProjectPhase('acceptance')).toBe('completed');
    expect(toDouyinProjectPhase('pending_start')).toBeNull();
  });
});

export const PROJECT_LOG_COMMENT_AUTHOR_TYPE_VALUES = [
  'employee',
  'customer',
] as const;

export type ProjectLogCommentAuthorType =
  (typeof PROJECT_LOG_COMMENT_AUTHOR_TYPE_VALUES)[number];

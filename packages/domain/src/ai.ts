export const AI_MESSAGE_ROLE_VALUES = ['user', 'assistant'] as const;

export type AiMessageRole = (typeof AI_MESSAGE_ROLE_VALUES)[number];

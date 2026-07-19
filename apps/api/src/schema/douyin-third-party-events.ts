import { z } from "zod";

const MAX_ID_LENGTH = 128;
const MAX_NONCE_LENGTH = 128;
const MAX_ENCRYPTED_LENGTH = 512 * 1024;
const MAX_TICKET_LENGTH = 4 * 1024;
const MAX_AUTHORIZATION_CODE_LENGTH = 4 * 1024;
const MAX_EVENT_NAME_LENGTH = 64;
const UnixSecondsSchema = z.union([
  z.string().regex(/^\d{10}$/),
  z.number().int().min(1_000_000_000).max(9_999_999_999),
]).transform(String);
const IdSchema = z.string().min(1).max(MAX_ID_LENGTH);
const EventNameSchema = z.string()
  .min(1)
  .max(MAX_EVENT_NAME_LENGTH)
  .regex(/^[A-Z][A-Z0-9_]*$/);

export const DouyinCallbackWrapperSchema = z.strictObject({
  Nonce: z.string().min(1).max(MAX_NONCE_LENGTH),
  TimeStamp: UnixSecondsSchema,
  Encrypt: z.string().min(1).max(MAX_ENCRYPTED_LENGTH),
  MsgSignature: z.string().regex(/^[0-9a-f]{40}$/),
});

export const DouyinTicketEventSchema = z.strictObject({
  Ticket: z.string().min(1).max(MAX_TICKET_LENGTH),
  MsgType: z.literal("Ticket"),
  Event: z.literal("PUSH"),
  EventTime: UnixSecondsSchema.optional(),
  CreateTime: UnixSecondsSchema.optional(),
});

const AuthorizationBase = {
  AppId: IdSchema,
  TpAppId: IdSchema,
  AuthorizationCode: z.string().min(1).max(MAX_AUTHORIZATION_CODE_LENGTH),
  AuthorizationCodeExpiresIn: z.number().int().positive().max(86_400),
  EventTime: UnixSecondsSchema.optional(),
  CreateTime: UnixSecondsSchema.optional(),
};

export const DouyinAuthorizedEventSchema = z.strictObject({
  ...AuthorizationBase,
  Event: z.literal("AUTHORIZED"),
});

export const DouyinUpdateAuthorizedEventSchema = z.strictObject({
  ...AuthorizationBase,
  Event: z.literal("UPDATE_AUTHORIZED"),
});

export const DouyinUnauthorizedEventSchema = z.strictObject({
  AppId: IdSchema,
  TpAppId: IdSchema,
  Event: z.literal("UNAUTHORIZED"),
  EventTime: UnixSecondsSchema.optional(),
  CreateTime: UnixSecondsSchema.optional(),
});

export const DouyinUnsupportedEventSchema = z.strictObject({
  AppId: IdSchema.optional(),
  TpAppId: IdSchema.optional(),
  Event: EventNameSchema,
  EventTime: UnixSecondsSchema.optional(),
  CreateTime: UnixSecondsSchema.optional(),
});

export type DouyinCallbackWrapper = z.infer<typeof DouyinCallbackWrapperSchema>;
export type DouyinTicketEvent = z.infer<typeof DouyinTicketEventSchema>;
export type DouyinAuthorizedEvent = z.infer<typeof DouyinAuthorizedEventSchema>;
export type DouyinUpdateAuthorizedEvent = z.infer<typeof DouyinUpdateAuthorizedEventSchema>;
export type DouyinUnauthorizedEvent = z.infer<typeof DouyinUnauthorizedEventSchema>;
export type DouyinUnsupportedEvent = z.infer<typeof DouyinUnsupportedEventSchema>;
export type DouyinAuthorizationLifecycleEvent =
  | DouyinAuthorizedEvent
  | DouyinUpdateAuthorizedEvent;
export type DouyinDecryptedEvent =
  | DouyinTicketEvent
  | DouyinAuthorizationLifecycleEvent
  | DouyinUnauthorizedEvent
  | DouyinUnsupportedEvent;

export function parseDouyinDecryptedEvent(value: unknown): DouyinDecryptedEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = (value as { Event?: unknown }).Event;
  const schema = event === "PUSH"
    ? DouyinTicketEventSchema
    : event === "AUTHORIZED"
      ? DouyinAuthorizedEventSchema
      : event === "UPDATE_AUTHORIZED"
        ? DouyinUpdateAuthorizedEventSchema
        : event === "UNAUTHORIZED"
          ? DouyinUnauthorizedEventSchema
          : DouyinUnsupportedEventSchema;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

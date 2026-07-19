import { z } from "zod";

const MAX_ID_LENGTH = 128;
const MAX_NONCE_LENGTH = 128;
const MAX_ENCRYPTED_LENGTH = 512 * 1024;
const MAX_TICKET_LENGTH = 4 * 1024;
const MAX_AUTHORIZATION_CODE_LENGTH = 4 * 1024;
const MAX_EVENT_NAME_LENGTH = 64;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const UnixSecondsSchema = z.union([
  z.string().regex(/^\d{10}$/),
  z.number().int().min(1_000_000_000).max(9_999_999_999),
]).transform(String);
const DecryptedUnixSecondsSchema = UnixSecondsSchema.transform(
  (value) => new Date(Number(value) * 1000).toISOString(),
);
const CalendarTimestampSchema = z.string()
  .regex(/^[1-9]\d{3}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  .transform((value, context) => {
    const parts = value.match(/\d+/g)?.map(Number);
    if (!parts || parts.length !== 6) return invalidCalendarTimestamp(context);
    const [year, month, day, hour, minute, second] = parts as [
      number, number, number, number, number, number,
    ];
    const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const local = new Date(localAsUtc);
    if (
      local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 ||
      local.getUTCDate() !== day || local.getUTCHours() !== hour ||
      local.getUTCMinutes() !== minute || local.getUTCSeconds() !== second
    ) return invalidCalendarTimestamp(context);
    return new Date(localAsUtc - SHANGHAI_OFFSET_MS).toISOString();
  });
const DecryptedEventTimeSchema = z.union([
  DecryptedUnixSecondsSchema,
  CalendarTimestampSchema,
]);
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

export const DouyinTicketEventSchema = z.object({
  Ticket: z.string().min(1).max(MAX_TICKET_LENGTH),
  MsgType: z.literal("Ticket"),
  Event: z.literal("PUSH"),
  EventTime: DecryptedEventTimeSchema.optional(),
  CreateTime: DecryptedEventTimeSchema.optional(),
});

const AuthorizationBase = {
  AppId: IdSchema,
  TpAppId: IdSchema,
  AuthorizationCode: z.string().min(1).max(MAX_AUTHORIZATION_CODE_LENGTH),
  AuthorizationCodeExpiresIn: z.number().int().positive().max(86_400),
  EventTime: DecryptedEventTimeSchema.optional(),
  CreateTime: DecryptedEventTimeSchema.optional(),
};

export const DouyinAuthorizedEventSchema = z.object({
  ...AuthorizationBase,
  Event: z.literal("AUTHORIZED"),
});

export const DouyinUpdateAuthorizedEventSchema = z.object({
  ...AuthorizationBase,
  Event: z.literal("UPDATE_AUTHORIZED"),
});

export const DouyinUnauthorizedEventSchema = z.object({
  AppId: IdSchema,
  TpAppId: IdSchema,
  Event: z.literal("UNAUTHORIZED"),
  EventTime: DecryptedEventTimeSchema.optional(),
  CreateTime: DecryptedEventTimeSchema.optional(),
});

export const DouyinUnsupportedEventSchema = z.object({
  AppId: IdSchema.optional(),
  TpAppId: IdSchema.optional(),
  Event: EventNameSchema,
  EventTime: DecryptedEventTimeSchema.optional(),
  CreateTime: DecryptedEventTimeSchema.optional(),
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

function invalidCalendarTimestamp(context: z.RefinementCtx): typeof z.NEVER {
  context.addIssue({ code: "custom", message: "无效的抖音回调日历时间" });
  return z.NEVER;
}

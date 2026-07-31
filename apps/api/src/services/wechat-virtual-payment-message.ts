import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { Errors } from "@/errors/error-factory";

export const WECHAT_VIRTUAL_MESSAGE_BODY_LIMIT = 64 * 1024;

export type WechatVirtualMessageFormat = "json" | "xml";

export type WechatVirtualGoodsDeliveryMessage = {
  format: WechatVirtualMessageFormat;
  eventType: "xpay_goods_deliver_notify";
  toUserName: string;
  fromUserName: string;
  providerCreatedAtUnix: number;
  messageType: "event";
  openid: string;
  outTradeNo: string;
  environment: "sandbox" | "production";
  providerOrderNo: string;
  transactionId: string;
  paidAt: string;
  providerProductId: string;
  quantity: 1;
  origPriceFen: number;
  actualPriceFen: number;
  attach: string;
};

type MessageSignatureInput = {
  token: string;
  timestamp: string;
  nonce: string;
};

const exactText = (max: number) => z.string()
  .min(1)
  .max(max)
  .refine((value) => value.trim() === value);

const integerField = (max: number) => z.preprocess(
  (value) => typeof value === "string" && /^\d+$/.test(value)
    ? Number(value)
    : value,
  z.number().int().nonnegative().max(max),
);

const WechatVirtualGoodsDeliverySchema = z.object({
  ToUserName: exactText(128),
  FromUserName: exactText(128),
  CreateTime: integerField(4_102_444_800),
  MsgType: z.literal("event"),
  Event: z.literal("xpay_goods_deliver_notify"),
  OpenId: exactText(128),
  OutTradeNo: exactText(32),
  Env: z.preprocess(
    (value) => typeof value === "string" && /^[01]$/.test(value)
      ? Number(value)
      : value,
    z.union([z.literal(0), z.literal(1)]),
  ),
  WeChatPayInfo: z.object({
    MchOrderNo: exactText(128),
    TransactionId: exactText(128),
    PaidTime: integerField(4_102_444_800),
  }).strict(),
  GoodsInfo: z.object({
    ProductId: exactText(128),
    Quantity: z.preprocess(
      (value) => value === "1" ? 1 : value,
      z.literal(1),
    ),
    OrigPrice: integerField(2_147_483_647),
    ActualPrice: integerField(2_147_483_647),
    Attach: exactText(128),
  }).strict(),
  TeamInfo: z.object({
    ActivityId: exactText(128),
    TeamId: exactText(128),
    TeamType: integerField(1),
    TeamAction: integerField(1),
  }).strict().optional(),
}).strict();

export function buildWechatMessageSignature(
  input: MessageSignatureInput,
): string {
  return createHash("sha1")
    .update([input.token, input.timestamp, input.nonce].sort().join(""))
    .digest("hex");
}

export function verifyWechatMessageSignature(
  input: MessageSignatureInput & { signature: string },
): boolean {
  if (!/^[0-9a-f]{40}$/i.test(input.signature)) return false;
  const expected = Buffer.from(buildWechatMessageSignature(input), "hex");
  const received = Buffer.from(input.signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function parseWechatVirtualPaymentMessage(input: {
  contentType: string;
  rawBody: string;
}): WechatVirtualGoodsDeliveryMessage {
  if (Buffer.byteLength(input.rawBody, "utf8") > WECHAT_VIRTUAL_MESSAGE_BODY_LIMIT) {
    throw Errors.business(
      413,
      "微信虚拟支付消息体超过限制",
      "WECHAT_VIRTUAL_MESSAGE_BODY_TOO_LARGE",
    );
  }

  const format = resolveMessageFormat(input.contentType);
  const decoded = format === "json"
    ? parseJsonPayload(input.rawBody)
    : parseXmlPayload(input.rawBody);
  const parsed = WechatVirtualGoodsDeliverySchema.safeParse(decoded);
  if (!parsed.success) {
    throw Errors.business(
      400,
      "微信虚拟支付消息格式不正确",
      "WECHAT_VIRTUAL_MESSAGE_PAYLOAD_INVALID",
      { field: parsed.error.issues[0]?.path.join(".") || "payload" },
    );
  }

  const payload = parsed.data;
  return {
    format,
    eventType: payload.Event,
    toUserName: payload.ToUserName,
    fromUserName: payload.FromUserName,
    providerCreatedAtUnix: payload.CreateTime,
    messageType: payload.MsgType,
    openid: payload.OpenId,
    outTradeNo: payload.OutTradeNo,
    environment: payload.Env === 1 ? "sandbox" : "production",
    providerOrderNo: payload.WeChatPayInfo.MchOrderNo,
    transactionId: payload.WeChatPayInfo.TransactionId,
    paidAt: new Date(payload.WeChatPayInfo.PaidTime * 1_000).toISOString(),
    providerProductId: payload.GoodsInfo.ProductId,
    quantity: payload.GoodsInfo.Quantity,
    origPriceFen: payload.GoodsInfo.OrigPrice,
    actualPriceFen: payload.GoodsInfo.ActualPrice,
    attach: payload.GoodsInfo.Attach,
  };
}

function resolveMessageFormat(contentType: string): WechatVirtualMessageFormat {
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (normalized === "application/json") return "json";
  if (normalized === "application/xml" || normalized === "text/xml") {
    return "xml";
  }
  throw Errors.business(
    415,
    "微信虚拟支付消息格式不受支持",
    "WECHAT_VIRTUAL_MESSAGE_CONTENT_TYPE_UNSUPPORTED",
  );
}

function parseJsonPayload(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw Errors.business(
      400,
      "微信虚拟支付 JSON 消息格式不正确",
      "WECHAT_VIRTUAL_MESSAGE_PAYLOAD_INVALID",
    );
  }
}

interface XmlChildren {
  [name: string]: XmlNode;
}

type XmlNode = string | XmlChildren;

function parseXmlPayload(rawBody: string): unknown {
  if (/<!DOCTYPE|<!ENTITY|<!--|<\?/i.test(rawBody.replace(/^\s*<\?xml[^?]*\?>/, ""))) {
    throw invalidXml();
  }
  const source = rawBody.replace(/^\s*<\?xml[^?]*\?>/, "").trim();
  const parser = new StrictXmlParser(source);
  const root = parser.parse();
  if (!root.xml || typeof root.xml === "string") throw invalidXml();
  return root.xml;
}

class StrictXmlParser {
  private cursor = 0;
  private nodeCount = 0;

  constructor(private readonly source: string) {}

  parse(): Record<string, XmlNode> {
    const result = this.parseElement(0);
    this.skipWhitespace();
    if (this.cursor !== this.source.length) throw invalidXml();
    return result;
  }

  private parseElement(depth: number): Record<string, XmlNode> {
    if (depth > 4 || ++this.nodeCount > 64) throw invalidXml();
    this.skipWhitespace();
    const name = this.readOpeningTag();
    const children: Record<string, XmlNode> = {};
    let text = "";
    let hasChild = false;

    while (this.cursor < this.source.length) {
      if (this.source.startsWith(`</${name}>`, this.cursor)) {
        this.cursor += name.length + 3;
        const value: XmlNode = hasChild ? children : decodeXmlText(text.trim());
        return { [name]: value };
      }
      if (this.source.startsWith("<![CDATA[", this.cursor)) {
        if (hasChild) throw invalidXml();
        const end = this.source.indexOf("]]>", this.cursor + 9);
        if (end < 0) throw invalidXml();
        text += this.source.slice(this.cursor + 9, end);
        this.cursor = end + 3;
        continue;
      }
      if (this.source[this.cursor] === "<") {
        if (text.trim()) throw invalidXml();
        const child = this.parseElement(depth + 1);
        const [childName, childValue] = Object.entries(child)[0] ?? [];
        if (!childName || childValue === undefined || childName in children) {
          throw invalidXml();
        }
        children[childName] = childValue;
        hasChild = true;
        continue;
      }
      text += this.source[this.cursor] ?? "";
      this.cursor += 1;
    }
    throw invalidXml();
  }

  private readOpeningTag(): string {
    const rest = this.source.slice(this.cursor);
    const match = /^<([A-Za-z][A-Za-z0-9_]*)>/.exec(rest);
    if (!match?.[1]) throw invalidXml();
    this.cursor += match[0].length;
    return match[1];
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.source[this.cursor] ?? "")) this.cursor += 1;
  }
}

function decodeXmlText(value: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos);)/.test(value)) throw invalidXml();
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity: string) => ({
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  })[entity] ?? "");
}

function invalidXml() {
  return Errors.business(
    400,
    "微信虚拟支付 XML 消息格式不正确",
    "WECHAT_VIRTUAL_MESSAGE_PAYLOAD_INVALID",
  );
}

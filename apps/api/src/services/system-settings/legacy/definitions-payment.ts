import type { SettingDefinition } from "./shared";

export const DEFINITIONS_PAYMENT: SettingDefinition[] = [
  {
    key: "PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
    groupCode: "payment",
    name: "平台微信支付密钥包",
    description: "平台独立微信支付使用的私钥、接口 v3 密钥和微信支付公钥配置，按结构化数据加密存储。",
    valueType: "json",
    envNames: ["PLATFORM_WECHAT_PAY_SECRET_BUNDLE"],
    isSecret: true,
  },
  {
    key: "PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
    groupCode: "payment",
    name: "平台微信支付服务商密钥包",
    description: "平台服务商微信支付使用的私钥、接口 v3 密钥和微信支付公钥配置，按结构化数据加密存储。",
    valueType: "json",
    envNames: ["PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE"],
    isSecret: true,
  },
  {
    key: "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
    groupCode: "payment",
    name: "微信虚拟支付沙箱密钥包",
    description: "微信小程序虚拟支付沙箱 AppKey，按结构化数据加密存储。",
    valueType: "json",
    envNames: ["WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE"],
    isSecret: true,
  },
  {
    key: "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
    groupCode: "payment",
    name: "微信虚拟支付生产密钥包",
    description: "微信小程序虚拟支付生产 AppKey，按结构化数据加密存储。",
    valueType: "json",
    envNames: ["WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE"],
    isSecret: true,
  },
  {
    key: "PLATFORM_SERVICE_ACCEPTANCE_WINDOW_DAYS",
    groupCode: "payment",
    name: "平台技术服务验收确认期",
    description: "平台提交技术服务验收后，租户客户可确认验收或要求整改的天数；逾期后平台可按履约材料手动确认验收。",
    valueType: "number",
    envNames: ["PLATFORM_SERVICE_ACCEPTANCE_WINDOW_DAYS"],
    defaultValue: "3",
  },
];

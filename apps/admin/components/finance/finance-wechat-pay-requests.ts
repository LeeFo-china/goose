import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

export type WechatPayConfigView = {
  id: string;
  merchant_mode: string;
  merchant_name: string | null;
  merchant_id: string | null;
  sub_merchant_id: string | null;
  app_id: string | null;
  sub_app_id: string | null;
  status: string;
  enabled_channels: unknown;
  settlement_account_summary: string | null;
  encrypted_config_ref: string | null;
  has_encrypted_config_ref: boolean;
  risk_switches: unknown;
  serial_no_masked: string | null;
  notify_url: string | null;
  validation_status: string;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
};

export type WechatPayConfigData = {
  configured: boolean;
  can_manage: boolean;
  config: WechatPayConfigView | null;
};

export type WechatPayConfigResult = WechatPayConfigData & {
  error: string | null;
};

export function emptyWechatPayConfig(): WechatPayConfigResult {
  return {
    configured: false,
    can_manage: false,
    config: null,
    error: null,
  };
}

export async function fetchWechatPayConfig(): Promise<WechatPayConfigResult> {
  const token = await getAdminToken();
  if (!token) {
    return {
      ...emptyWechatPayConfig(),
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl("/finance/wechat-pay/config"), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<WechatPayConfigData>(response);
    return {
      ...(payload.data || emptyWechatPayConfig()),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyWechatPayConfig(),
      error: error instanceof Error ? error.message : "微信支付配置加载失败",
    };
  }
}

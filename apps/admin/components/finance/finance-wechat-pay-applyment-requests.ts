import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import {
  emptyWechatPayApplyment,
  type WechatPayApplymentDetailData,
  type WechatPayApplymentDetailResult,
} from "./finance-wechat-pay-applyment-shared";

export type {
  WechatPayApplymentDetailData,
  WechatPayApplymentDetailResult,
  WechatPayApplymentEvent,
  WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";

export async function fetchWechatPayApplymentCurrent():
  Promise<WechatPayApplymentDetailResult> {
  const token = await getAdminToken();
  if (!token) {
    return {
      ...emptyWechatPayApplyment(),
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(
      buildBackendUrl("/finance/wechat-pay/applyment/current"),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<WechatPayApplymentDetailData>(
      response,
    );
    return {
      ...(payload.data || emptyWechatPayApplyment()),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyWechatPayApplyment(),
      error: error instanceof Error ? error.message : "微信支付开通申请加载失败",
    };
  }
}

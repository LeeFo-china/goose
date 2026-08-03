import type { ServiceUnavailableCode } from "../../models";

const COPY: Record<ServiceUnavailableCode, { title: string; description: string }> = {
  DOUYIN_INSTALLATION_MISSING: {
    title: "服务配置异常",
    description: "当前小程序尚未完成配置，请稍后再试。",
  },
  DOUYIN_INSTALLATION_DISABLED: {
    title: "服务已暂停",
    description: "当前小程序服务暂不可用，请稍后再试。",
  },
  DOUYIN_AUTHORIZATION_EXPIRED: {
    title: "服务已暂停",
    description: "小程序授权状态异常，请联系装修公司。",
  },
  DOUYIN_SESSION_EXCHANGE_FAILED: {
    title: "暂时无法进入",
    description: "会话初始化失败，请稍后重新打开小程序。",
  },
  TENANT_NOT_AVAILABLE: {
    title: "装修公司服务已暂停",
    description: "当前装修公司暂无法提供服务，请联系公司或平台客服。",
  },
  NETWORK_ERROR: {
    title: "网络开小差了",
    description: "请检查网络后重新打开小程序。",
  },
};

Page({
  data: COPY.NETWORK_ERROR,
  onLoad(query) {
    const code = typeof query.code === "string"
      && Object.prototype.hasOwnProperty.call(COPY, query.code)
      ? query.code as ServiceUnavailableCode
      : "NETWORK_ERROR";
    this.setData(COPY[code]);
  },
});

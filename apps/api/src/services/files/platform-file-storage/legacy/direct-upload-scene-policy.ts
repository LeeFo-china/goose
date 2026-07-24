export const WECHAT_PAY_APPLYMENT_UPLOAD_POLICY = {
  scene: "wechat_pay_applyment",
  maxSizeBytes: 2 * 1024 * 1024,
  mimeTypes: new Set(["image/jpeg", "image/png"]),
  sizeError: "微信支付进件附件大小校验失败",
  typeError: "微信支付进件附件类型校验失败",
  checksumError: "进件附件文件校验值不一致",
} as const;

export function getWechatPayApplymentUploadPolicy(scene: string) {
  return scene === WECHAT_PAY_APPLYMENT_UPLOAD_POLICY.scene
    ? WECHAT_PAY_APPLYMENT_UPLOAD_POLICY
    : null;
}

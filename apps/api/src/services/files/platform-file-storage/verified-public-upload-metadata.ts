import type COS from "cos-nodejs-sdk-v5";

import { verifyBrandLogoCosObject } from "./brand-logo-cos-verifier";
import { verifyVirtualGoodsCosObject } from "./virtual-goods-cos-verifier";

type PublicImageCosClient = Pick<COS, "headObject" | "getObject">;

export function verifyPublicUploadMetadata(input: {
  isBrandLogo: boolean;
  isVirtualGoodsImage: boolean;
  cos: PublicImageCosClient;
  bucket: string;
  region: string;
  objectKey: string;
  declaredMimeType: string;
  declaredSize: number;
  clientEtag?: string | null;
}) {
  const verificationInput = {
    cos: input.cos,
    bucket: input.bucket,
    region: input.region,
    objectKey: input.objectKey,
    declaredMimeType: input.declaredMimeType,
    declaredSize: input.declaredSize,
    clientEtag: input.clientEtag,
  };
  if (input.isBrandLogo) {
    return verifyBrandLogoCosObject(verificationInput);
  }
  if (input.isVirtualGoodsImage) {
    return verifyVirtualGoodsCosObject(verificationInput);
  }
  return null;
}

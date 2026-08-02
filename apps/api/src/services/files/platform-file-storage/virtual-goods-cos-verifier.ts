import type COS from "cos-nodejs-sdk-v5";

import { Errors } from "@/errors/error-factory";
import { verifyBrandLogoCosObject } from "./brand-logo-cos-verifier";
import {
  assertVirtualGoodsImageDeclaration,
  assertVirtualGoodsImageProperties,
  invalidVirtualGoodsImage,
} from "./virtual-goods-image-policy";

type VirtualGoodsCosClient = Pick<COS, "headObject" | "getObject">;

export function validateVirtualGoodsDirectUpload(input: {
  scene: string;
  visibility?: string;
  tenantId?: string | null;
  employeeId?: string | null;
  mimetype?: string;
  sizeBytes?: number | null;
}): boolean {
  if (input.scene !== "branding_virtual_goods") return false;
  if (
    input.visibility !== "public" ||
    input.tenantId !== null ||
    !input.employeeId
  ) throw Errors.forbidden();
  assertVirtualGoodsImageDeclaration({
    mimeType: input.mimetype ?? "",
    sizeBytes: input.sizeBytes ?? 0,
  });
  return true;
}

export async function verifyVirtualGoodsCosObject(input: {
  cos: VirtualGoodsCosClient;
  bucket: string;
  region: string;
  objectKey: string;
  declaredMimeType: string;
  declaredSize: number;
  clientEtag?: string | null;
}) {
  try {
    assertVirtualGoodsImageDeclaration({
      mimeType: input.declaredMimeType,
      sizeBytes: input.declaredSize,
    });
    const verified = await verifyBrandLogoCosObject(input);
    assertVirtualGoodsImageProperties({
      mimeType: verified.mimeType,
      sizeBytes: verified.sizeBytes,
      width: verified.width,
      height: verified.height,
    });
    return verified as typeof verified & {
      mimeType: "image/png" | "image/jpeg";
    };
  } catch {
    return invalidVirtualGoodsImage();
  }
}

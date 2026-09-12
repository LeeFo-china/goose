import { postArkJson } from "./http";
import { arkEndpoint, buildArkRenderingRequest, buildArkVisionRequest } from "./requests";
import { parseArkRenderingResponse, parseArkVisionResponse } from "./responses";
import type { ArkGatewayConfig, ArkGatewayDependencies, ArkRenderingInput, ArkRenderingResult, ArkVisionInput, ArkVisionResult } from "./types";

export async function generateArkRendering(config: ArkGatewayConfig, input: ArkRenderingInput, dependencies: ArkGatewayDependencies = {}): Promise<ArkRenderingResult> {
  const url = arkEndpoint(config, "/images/generations");
  const body = buildArkRenderingRequest(config, input);
  const { payload, headers } = await postArkJson(config, { url, body }, dependencies);
  return parseArkRenderingResponse(payload, headers);
}

export async function requestArkVision(config: ArkGatewayConfig, input: ArkVisionInput, dependencies: ArkGatewayDependencies = {}): Promise<ArkVisionResult> {
  const url = arkEndpoint(config, "/chat/completions");
  const body = buildArkVisionRequest(config, input);
  const { payload, headers } = await postArkJson(config, { url, body }, dependencies);
  return parseArkVisionResponse(payload, headers);
}

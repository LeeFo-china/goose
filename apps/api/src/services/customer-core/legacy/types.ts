import type {
  CustomerCoreRow,
  CustomerLatestProjectSummary,
} from "@/repositories/customer-core";
import { customerFollowUpService } from "@/services/customer-follow-ups";

export type CustomerListResult = {
  rows: CustomerCoreRow[];
  total: number;
  followUpMap: Awaited<ReturnType<typeof customerFollowUpService.getLatestFollowUpMap>>;
  latestProjectMap: Map<string, CustomerLatestProjectSummary>;
  page: number;
  pageSize: number;
  debugTimings?: Record<string, number | string | null>;
};

export type LatestFollowUpSummary =
  Awaited<ReturnType<typeof customerFollowUpService.getLatestFollowUpMap>> extends Map<string, infer T>
    ? T | undefined
    : never;

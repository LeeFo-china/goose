"use client";

import { create } from "zustand";
import type {
  ReleaseDispatchResult,
  ReleaseEnvironment,
  ReleaseRefType,
  ReleaseService,
} from "@/components/ops/ops-types";

type ProductionVersionMode = "existing_tag" | "new_tag";

type ReleaseDeploymentState = {
  environment: ReleaseEnvironment;
  service: ReleaseService;
  services: ReleaseService[];
  refType: ReleaseRefType;
  ref: string;
  reason: string;
  confirmText: string;
  latestDispatch: ReleaseDispatchResult | null;
  productionVersionMode: ProductionVersionMode;
  tagName: string;
  tagSourceRefType: ReleaseRefType;
  tagSourceRef: string;
  tagMessage: string;
  rollbackPendingId: string;
  setDraft: (draft: Partial<Omit<ReleaseDeploymentState, "setDraft" | "resetEnvironment" | "resetRefType">>) => void;
  resetEnvironment: (input: {
    environment: ReleaseEnvironment;
    defaultRef: string;
    service: ReleaseService;
  }) => void;
  resetRefType: (input: {
    refType: ReleaseRefType;
    defaultRef: string;
  }) => void;
};

export const useReleaseDeploymentStore = create<ReleaseDeploymentState>((set) => ({
  environment: "dev",
  service: "admin",
  services: ["admin"],
  refType: "branch",
  ref: "feature/multi-tenant",
  reason: "",
  confirmText: "",
  latestDispatch: null,
  productionVersionMode: "existing_tag",
  tagName: "",
  tagSourceRefType: "branch",
  tagSourceRef: "feature/multi-tenant",
  tagMessage: "",
  rollbackPendingId: "",
  setDraft: (draft) => set(draft),
  resetEnvironment: ({ environment, defaultRef, service }) => {
    const refType = environment === "production" ? "tag" : "branch";
    set({
      environment,
      refType,
      ref: refType === "branch" ? defaultRef : "",
      service,
      services: [service],
      confirmText: "",
      productionVersionMode: "existing_tag",
    });
  },
  resetRefType: ({ refType, defaultRef }) => {
    set({
      refType,
      ref: refType === "branch" ? defaultRef : "",
    });
  },
}));

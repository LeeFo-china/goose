"use client";

import { create } from "zustand";
import type {
  ReleaseDispatchResult,
  ReleaseEnvironment,
  ReleaseRefType,
  ReleaseService,
} from "@/components/ops/ops-types";

type ReleaseAuxiliaryTab = "tag" | "successful";

type ReleaseDeploymentState = {
  environment: ReleaseEnvironment;
  service: ReleaseService;
  services: ReleaseService[];
  refType: ReleaseRefType;
  ref: string;
  reason: string;
  confirmText: string;
  latestDispatch: ReleaseDispatchResult | null;
  tagName: string;
  tagSourceRefType: ReleaseRefType;
  tagSourceRef: string;
  tagMessage: string;
  auxiliaryTab: ReleaseAuxiliaryTab;
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
  tagName: "",
  tagSourceRefType: "branch",
  tagSourceRef: "feature/multi-tenant",
  tagMessage: "",
  auxiliaryTab: "tag",
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
    });
  },
  resetRefType: ({ refType, defaultRef }) => {
    set({
      refType,
      ref: refType === "branch" ? defaultRef : "",
    });
  },
}));

import { ApplymentDraftSaveCancelledError } from "./finance-wechat-pay-applyment-autosave";
import { ApplymentDraftRevisionAllocator } from "./finance-wechat-pay-applyment-autosave-coordinator";

type DraftSessionRecord = {
  id: string;
  draft_epoch: number;
  draft_revision: number;
};

export class ApplymentDraftFencingSession {
  private draft: DraftSessionRecord | null = null;
  private epoch: number | null = null;
  private generation = 0;
  private claimPromise: Promise<void> | null = null;
  private readonly revisions = new ApplymentDraftRevisionAllocator();

  constructor(
    private readonly claim: (
      applymentId: string,
    ) => Promise<DraftSessionRecord>,
  ) {}

  reset(draft: DraftSessionRecord | null): void {
    this.generation += 1;
    this.draft = draft;
    this.epoch = null;
    this.claimPromise = null;
    this.revisions.reset();
  }

  adoptCreated(draft: DraftSessionRecord): void {
    this.generation += 1;
    this.draft = draft;
    this.epoch = normalizePositiveInteger(draft.draft_epoch);
    this.claimPromise = null;
    this.revisions.reset(draft.draft_revision);
  }

  async allocate(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const generation = this.generation;
    if (this.draft && this.epoch === null) await this.ensureClaim(generation);
    this.assertCurrent(generation);
    if (this.isIssuedPayload(payload)) return payload;
    const revisioned = this.revisions.allocate(payload);
    return this.epoch === null
      ? revisioned
      : { ...revisioned, draft_epoch: this.epoch };
  }

  private isIssuedPayload(payload: Record<string, unknown>): boolean {
    const revision = payload.draft_revision;
    if (!Number.isSafeInteger(revision) || Number(revision) <= 0) return false;
    if (!this.draft) {
      return this.epoch === null && payload.draft_epoch === undefined;
    }
    return this.epoch !== null && payload.draft_epoch === this.epoch;
  }

  private ensureClaim(generation: number): Promise<void> {
    if (!this.claimPromise) {
      const draft = this.draft;
      if (!draft) return Promise.resolve();
      const claim = this.claim(draft.id)
        .then((claimed) => {
          this.assertCurrent(generation);
          if (claimed.id !== draft.id) {
            throw new ApplymentDraftSaveCancelledError();
          }
          this.draft = claimed;
          this.epoch = normalizePositiveInteger(claimed.draft_epoch);
          this.revisions.reset(claimed.draft_revision);
        })
        .finally(() => {
          if (this.claimPromise === claim) this.claimPromise = null;
        });
      this.claimPromise = claim;
    }
    return this.claimPromise;
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.generation) {
      throw new ApplymentDraftSaveCancelledError();
    }
  }
}

function normalizePositiveInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ApplymentDraftSaveCancelledError();
  }
  return value;
}

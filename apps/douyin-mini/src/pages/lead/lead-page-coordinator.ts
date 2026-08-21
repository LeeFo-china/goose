type LeadPagePhase = "new" | "visible" | "hidden" | "unloaded";
type LeadOperation = "sms" | "submit";

export type LeadOperationAuthority = {
  readonly operation: LeadOperation;
  readonly sequence: number;
};

export class LeadPageCoordinator {
  private phase: LeadPagePhase = "new";
  private smsSequence = 0;
  private submitSequence = 0;
  private bootstrapLoading = false;
  private activeSms: LeadOperationAuthority | null = null;
  private activeSubmit: LeadOperationAuthority | null = null;

  onLoad(): boolean {
    if (this.phase !== "new") return false;
    this.phase = "visible";
    return true;
  }

  onShow(): boolean {
    if (this.phase === "unloaded") return false;
    const changed = this.phase !== "visible";
    this.phase = "visible";
    return changed;
  }

  onHide(): boolean {
    if (this.phase !== "visible") return false;
    this.phase = "hidden";
    this.invalidateOperations();
    return true;
  }

  onUnload(): boolean {
    if (this.phase === "unloaded") return false;
    this.phase = "unloaded";
    this.invalidateOperations();
    return true;
  }

  isVisible(): boolean {
    return this.phase === "visible";
  }

  beginBootstrapLoad(): boolean {
    if (this.phase === "unloaded" || this.bootstrapLoading) return false;
    this.bootstrapLoading = true;
    return true;
  }

  finishBootstrapLoad(): boolean {
    if (!this.bootstrapLoading) return false;
    this.bootstrapLoading = false;
    return this.isVisible();
  }

  beginSms(): LeadOperationAuthority | null {
    if (!this.isVisible() || this.activeSms) return null;
    this.activeSms = { operation: "sms", sequence: ++this.smsSequence };
    return this.activeSms;
  }

  finishSms(authority: LeadOperationAuthority): boolean {
    if (!matches(authority, this.activeSms)) return false;
    this.activeSms = null;
    return this.isVisible();
  }

  beginSubmit(): LeadOperationAuthority | null {
    if (!this.isVisible() || this.activeSubmit) return null;
    this.activeSubmit = { operation: "submit", sequence: ++this.submitSequence };
    return this.activeSubmit;
  }

  finishSubmit(authority: LeadOperationAuthority): boolean {
    if (!matches(authority, this.activeSubmit)) return false;
    this.activeSubmit = null;
    return this.isVisible();
  }

  private invalidateOperations(): void {
    this.smsSequence += 1;
    this.submitSequence += 1;
    this.activeSms = null;
    this.activeSubmit = null;
  }
}

export function getCooldownRemainingSeconds(
  cooldownUntil: number,
  now = Date.now(),
): number {
  if (!Number.isFinite(cooldownUntil) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((cooldownUntil - now) / 1_000));
}

export function recordSmsCooldownUntil(
  current: number,
  seconds: number,
  now = Date.now(),
): number {
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || !Number.isFinite(now)) return current;
  const candidate = now + seconds * 1_000;
  return Number.isSafeInteger(candidate) ? Math.max(current, candidate) : current;
}

function matches(
  authority: LeadOperationAuthority,
  active: LeadOperationAuthority | null,
): boolean {
  return active !== null
    && authority.operation === active.operation
    && authority.sequence === active.sequence;
}

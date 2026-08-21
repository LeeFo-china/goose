import type { LeadOperationAuthority, LeadPageCoordinator } from "./lead-page-coordinator";

export async function runPrivacyPolicyRefresh<T>(options: {
  coordinator: LeadPageCoordinator;
  authority: LeadOperationAuthority;
  refresh(): Promise<T | null>;
  onPending(): void;
  onSuccess(value: T): void;
  onFailure(): void;
}): Promise<void> {
  if (!options.coordinator.finishSubmit(options.authority)) return;
  options.onPending();
  let value: T | null;
  try {
    value = await options.refresh();
  } catch {
    if (options.coordinator.canPresentSubmitContinuation(options.authority)) {
      options.onFailure();
    }
    return;
  }
  if (!options.coordinator.canPresentSubmitContinuation(options.authority)) return;
  if (value === null) options.onFailure();
  else options.onSuccess(value);
}

export async function runPolicyNavigation(options: {
  coordinator: LeadPageCoordinator;
  navigate(): Promise<void>;
  onFailure(): void;
}): Promise<void> {
  const authority = options.coordinator.beginPolicyNavigation();
  if (!authority) return;
  try {
    await options.navigate();
  } catch {
    if (options.coordinator.finishPolicyNavigation(authority)) options.onFailure();
    return;
  }
  options.coordinator.finishPolicyNavigation(authority);
}

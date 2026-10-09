const eventKeys = new WeakMap<object, string>();

/** Bind persisted operation evidence to this exact response object, without serializing it. */
export function withTenantActivityEventKey<T extends object>(data: T, eventKey: string): T {
  eventKeys.set(data, eventKey);
  return data;
}

export function getTenantActivityEventKey(data: object): string | undefined {
  return eventKeys.get(data);
}

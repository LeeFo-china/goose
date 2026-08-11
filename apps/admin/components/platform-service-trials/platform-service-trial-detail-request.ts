type RequestCounter = { current: number };

export function beginLatestTrialDetailRequest(counter: RequestCounter) {
  const requestId = ++counter.current;
  return () => counter.current === requestId;
}

export function invalidateTrialDetailRequests(counter: RequestCounter) {
  counter.current += 1;
}

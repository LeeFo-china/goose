export type LatestRequestCoordinator = {
  begin: () => number;
  isCurrent: (token: number) => boolean;
  invalidate: () => void;
};

export function createLatestRequestCoordinator(): LatestRequestCoordinator {
  let latestToken = 0;

  return {
    begin() {
      latestToken += 1;
      return latestToken;
    },
    isCurrent(token) {
      return token === latestToken;
    },
    invalidate() {
      latestToken += 1;
    },
  };
}

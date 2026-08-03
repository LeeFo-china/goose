import type { DouyinEnvironment } from "../models";

export function readDouyinEnvironment(): DouyinEnvironment {
  const { microapp } = tt.getEnvInfoSync();
  return {
    appId: microapp.appId,
    envType: microapp.envType,
    version: microapp.mpVersion,
  };
}

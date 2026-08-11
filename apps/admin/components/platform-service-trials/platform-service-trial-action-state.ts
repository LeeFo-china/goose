import type {
  PlatformServiceTrialAction,
  PlatformServiceTrialAvailableActions,
} from "./platform-service-trial-types";

export const platformTrialActionKeys = ["review", "extend", "revoke", "assign"] as const;

const unavailableAction: PlatformServiceTrialAction = {
  enabled: false,
  disabled_reason: "后端未提供当前操作",
};

export function resolvePlatformTrialAction(
  actions: PlatformServiceTrialAvailableActions,
  key: typeof platformTrialActionKeys[number],
) {
  return actions[key] ?? unavailableAction;
}

export function getPlatformTrialDisabledReasons(
  actions: PlatformServiceTrialAvailableActions,
) {
  return platformTrialActionKeys.flatMap((key) => {
    const action = actions[key];
    return action && !action.enabled && action.disabled_reason
      ? [{ key, reason: action.disabled_reason }]
      : [];
  });
}

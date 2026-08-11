import { systemSettingsService } from '@/services/system-settings/legacy-service';

export const PLATFORM_SERVICE_TRIAL_APPLICATION_ENABLED_KEY =
  'PLATFORM_SERVICE_TRIAL_APPLICATION_ENABLED';
export const PLATFORM_SERVICE_TRIAL_ACCESS_ENABLED_KEY =
  'PLATFORM_SERVICE_TRIAL_ACCESS_ENABLED';

type GetBoolean = (key: string, fallback: boolean) => Promise<boolean>;

export class PlatformServiceTrialRollout {
  constructor(
    private readonly getBoolean: GetBoolean = (key, fallback) =>
      systemSettingsService.getBoolean(key, fallback),
  ) {}

  isApplicationEnabled() {
    return this.getBoolean(
      PLATFORM_SERVICE_TRIAL_APPLICATION_ENABLED_KEY,
      false,
    );
  }

  isAccessEnabled() {
    return this.getBoolean(PLATFORM_SERVICE_TRIAL_ACCESS_ENABLED_KEY, false);
  }
}

export const platformServiceTrialRollout = new PlatformServiceTrialRollout();

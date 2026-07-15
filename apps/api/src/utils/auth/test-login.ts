export function isPhoneLoginWithoutCodeEnabled() {
  const value = (process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE || "").trim().toLowerCase();
  const enabled = value === "true" || value === "1" || value === "yes";
  if (!enabled) return false;

  const deployEnvironment = (process.env.GOOES_DEPLOY_ENV || "").trim().toLowerCase();
  if (deployEnvironment) return deployEnvironment === "development";

  return process.env.NODE_ENV !== "production";
}

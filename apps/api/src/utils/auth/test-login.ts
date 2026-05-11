export function isPhoneLoginWithoutCodeEnabled() {
  const value = (process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE || "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

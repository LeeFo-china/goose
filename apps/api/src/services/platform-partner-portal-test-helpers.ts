export async function withPhoneLoginWithoutCodeFlag<T>(
  value: string | undefined,
  callback: () => Promise<T>,
) {
  const previousFlag = process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE;
  if (value === undefined) {
    delete process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE;
  } else {
    process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE = value;
  }

  try {
    return await callback();
  } finally {
    if (previousFlag === undefined) {
      delete process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE;
    } else {
      process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE = previousFlag;
    }
  }
}

type AdminLoginRouter = {
  replace: (path: string) => void;
};

export function getAdminLoginNotice(reason: string | undefined) {
  return reason === "session_expired" ? "登录已过期，请重新登录" : null;
}

export function navigateAfterAdminLogin(router: AdminLoginRouter) {
  router.replace("/dashboard");
}

type AdminLoginRouter = {
  replace: (path: string) => void;
};

export function navigateAfterAdminLogin(router: AdminLoginRouter) {
  router.replace("/dashboard");
}

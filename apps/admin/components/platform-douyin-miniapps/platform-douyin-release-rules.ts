export type PlatformDouyinInstallation = {
  id: string;
  authorizer_appid: string;
  installation_kind: "merchant" | "template_development";
  authorization_status: "authorized_unbound" | "active" | "disabled" | "revoked";
  permission_snapshot: unknown[];
  template_id?: string | null;
  template_version?: string | null;
  tenant: { id: string; name: string | null } | null;
};

function hasDevelopmentPermission(snapshot: unknown[]): boolean {
  return snapshot.some((entry) =>
    typeof entry === "object"
    && entry !== null
    && "id" in entry
    && entry.id === 1
  );
}

export function getDouyinReleasePageOptions(
  installations: readonly PlatformDouyinInstallation[],
) {
  const merchants = installations.filter((installation) =>
    installation.installation_kind === "merchant"
    && installation.authorization_status === "active"
    && hasDevelopmentPermission(installation.permission_snapshot)
  );
  return {
    merchants,
    defaultMerchantId: merchants[0]?.id ?? "",
  };
}

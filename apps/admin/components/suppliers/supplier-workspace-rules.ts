export function shouldLoadSupplierResources(moduleEnabled: boolean) {
  return moduleEnabled;
}

export function isRelationshipReadOnly(status: string) {
  return status === "blacklisted" || status === "terminated";
}

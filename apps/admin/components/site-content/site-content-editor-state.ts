export type SiteContentEditorTab = "editor" | "versions";

export function resolveSiteContentOpenState(
  currentOpen: boolean,
  requestedOpen: boolean,
  locked: boolean,
) {
  return locked ? currentOpen : requestedOpen;
}

export function resolveSiteContentEditorTab(
  currentTab: SiteContentEditorTab,
  requestedTab: SiteContentEditorTab,
  locked: boolean,
) {
  return locked ? currentTab : requestedTab;
}

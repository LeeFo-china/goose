export function isApplymentDataBearingControl(
  control: { name?: string; id?: string },
) {
  return Boolean(control.name?.trim());
}

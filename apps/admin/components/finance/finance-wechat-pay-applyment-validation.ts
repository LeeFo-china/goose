export function validateApplymentForm(
  form: HTMLFormElement,
  schedule: (callback: () => void) => void = (callback) => {
    requestAnimationFrame(callback);
  },
): boolean {
  const invalid = findFirstInvalidApplymentControl(form);
  if (!invalid) return true;
  schedule(() => {
    invalid.focus();
    if ("reportValidity" in invalid) {
      (invalid as HTMLInputElement).reportValidity();
    }
  });
  return false;
}

function findFirstInvalidApplymentControl(scope: ParentNode) {
  return scope.querySelector<HTMLElement>(":invalid");
}

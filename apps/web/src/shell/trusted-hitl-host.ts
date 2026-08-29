export type TrustedHitlCardKind = "approval" | "question";

export type TrustedHitlOpenRequest = {
  kind: TrustedHitlCardKind;
  id: string;
};

export function trustedHitlCardElementId(request: TrustedHitlOpenRequest): string {
  return `trusted-hitl-${request.kind}-${request.id}`;
}

export function focusTrustedHitlCard(request: TrustedHitlOpenRequest): boolean {
  const element = document.getElementById(trustedHitlCardElementId(request));
  if (!element) {
    return false;
  }
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusTarget =
    element.querySelector<HTMLElement>(
      "button:not([disabled]), textarea:not([disabled]), input:not([disabled])",
    ) ?? element;
  focusTarget.focus({ preventScroll: true });
  return true;
}

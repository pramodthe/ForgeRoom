import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  onEscape: () => void,
  escapeEnabled = true,
): void {
  const escapeRef = useRef(onEscape);
  const escapeEnabledRef = useRef(escapeEnabled);
  escapeRef.current = onEscape;
  escapeEnabledRef.current = escapeEnabled;
  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const activeDialog = dialog;

    const focusable = () =>
      Array.from(activeDialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => !element.hidden && element.getAttribute("aria-hidden") !== "true",
      );
    (
      activeDialog.querySelector<HTMLElement>("[data-autofocus]") ??
      focusable()[0] ??
      activeDialog
    ).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && escapeEnabledRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }
      const first = elements[0]!;
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previousFocus?.focus();
    };
  }, [dialogRef]);
}

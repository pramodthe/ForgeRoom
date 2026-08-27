type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;

export function setApiUnauthorizedHandler(next: UnauthorizedHandler | null): void {
  handler = next;
}

export function notifyApiUnauthorized(): void {
  handler?.();
}

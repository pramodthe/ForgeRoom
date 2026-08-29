type PoliteStatusProps = {
  id?: string;
  message: string | null;
};

/** Screen-reader announcements for async HITL feedback without stealing focus. */
export function PoliteStatus({ id, message }: PoliteStatusProps) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}

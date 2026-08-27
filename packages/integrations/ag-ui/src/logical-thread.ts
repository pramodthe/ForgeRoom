/** Stable logical AG-UI thread for one channel/coworker pair. */
export function buildLogicalAguiThreadId(channelId: string, coworkerId: string): string {
  return `thread_${channelId}_${coworkerId}`;
}

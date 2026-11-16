/**
 * Replies being written right now, so a reader can stop one. A reply keeps going when the
 * reader's connection drops or they move to another conversation, and is saved for them to
 * come back to; only an explicit stop ends it early. Kept in memory: the web service runs as
 * one instance.
 */
const activeReplies = new Map<string, { userId: string; stop: () => void }>();

export function registerReply(conversationId: string, userId: string, stop: () => void): () => void {
  const entry = { userId, stop };
  activeReplies.set(conversationId, entry);
  return () => {
    // A newer reply in the same conversation may have taken this one's place
    if (activeReplies.get(conversationId) === entry) activeReplies.delete(conversationId);
  };
}

/** Stop the reply being written in a conversation, if it's this reader's. Returns whether one was. */
export function stopReply(conversationId: string, userId: string): boolean {
  const entry = activeReplies.get(conversationId);
  if (!entry || entry.userId !== userId) return false;
  entry.stop();
  return true;
}

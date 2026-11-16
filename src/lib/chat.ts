import { localToday } from "@/lib/reading-dates";
import { supabase } from "@/lib/supabase";
import type { Conversation, Message, MessageAction } from "@/lib/types";

const CONVERSATION_FIELDS = "*, book:books(id, title, status)";

export const CONVERSATION_PAGE_SIZE = 20;

export async function fetchConversations(
  limit = CONVERSATION_PAGE_SIZE,
): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_FIELDS)
    .is("archived_at", null)
    .eq("is_onboarding", false)
    .order("last_message_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as Conversation[];
}

export async function fetchConversation(id: string): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_FIELDS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as Conversation | null;
}

/** The reader's conversations about a book, latest first. */
export async function fetchConversationsForBook(bookId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_FIELDS)
    .eq("book_id", bookId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false });

  if (error) throw error;
  return data as Conversation[];
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const { error } = await supabase.from("conversations").update({ title }).eq("id", id);
  if (error) throw error;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchMessages(
  conversationId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export interface ChatDone {
  /** Null when the reader stopped the reply before it wrote anything */
  message_id: string | null;
  stopped?: boolean;
  /** Stopped before writing anything: the message was taken back off the conversation */
  unsent?: boolean;
  /** Replies used this month, counting this one */
  messages_used?: number;
}

export interface ChatError {
  message: string;
  /** The server's reason, for the cases the chat handles itself (limits, a message that's too long) */
  code?: string;
  messages_used?: number;
}

export interface ChatCallbacks {
  onMeta: (data: { conversation_id: string }) => void;
  onText: (data: { content: string }) => void;
  onThinking: () => void;
  onAction: (action: MessageAction) => void;
  onDone: (data: ChatDone) => void;
  onError: (data: ChatError) => void;
  /** The connection closed before the reply finished. The server keeps going and saves it. */
  onDisconnect: () => void;
}

export interface SendMessageOptions {
  isOnboarding?: boolean;
  bookId?: string;
  /** Resending after a failed reply, so the server doesn't save the message twice */
  retry?: boolean;
}

/** Ask the server to stop the reply being written in a conversation. */
export async function stopReply(conversationId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  await fetch("/api/chat/stop", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
    },
    body: JSON.stringify({ conversation_id: conversationId }),
  });
}

export function sendMessage(
  conversationId: string | null,
  message: string,
  callbacks: ChatCallbacks,
  options?: SendMessageOptions,
): AbortController {
  const controller = new AbortController();

  void (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const body: Record<string, unknown> = {
        conversation_id: conversationId,
        today: localToday(),
        message,
      };
      // Only send is_onboarding for new conversations
      if (options?.isOnboarding && !conversationId) {
        body.is_onboarding = true;
      }
      // A conversation's book is set when it starts
      if (options?.bookId && !conversationId) {
        body.book_id = options.bookId;
      }
      if (options?.retry) body.retry = true;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token && {
            Authorization: `Bearer ${session.access_token}`,
          }),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        try {
          const errData = await response.json();
          const code = typeof errData.error === "string" ? errData.error : undefined;
          if (code === "message_limit_reached") {
            callbacks.onError({ message: "message_limit_reached", code, messages_used: errData.messages_used });
            return;
          }
          // Busy, the monthly cap, or a message that's too long: the server says what to do
          if (typeof errData.message === "string") {
            callbacks.onError({ message: errData.message, code });
            return;
          }
          if (response.status === 413) {
            callbacks.onError({ message: "That message is too long.", code: "message_too_long" });
            return;
          }
        } catch {
          // Fall through to generic error
        }
        callbacks.onError({
          message:
            response.status === 429
              ? "That's a lot of messages at once. Wait a moment, then try again."
              : "Something went wrong on our side. Please try again.",
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // A reply ends with "done" or "error"; a stream that just stops lost its connection
      let finished = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const parts = buffer.split("\n\n");
        // Keep the last incomplete part in the buffer
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          let eventType = "message";
          let data = "";

          for (const line of trimmed.split("\n")) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ")) {
              data = line.slice(6);
            }
          }

          if (!data) continue;

          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            switch (eventType) {
              case "meta":
                callbacks.onMeta(parsed as { conversation_id: string });
                break;
              case "text":
                callbacks.onText(parsed as { content: string });
                break;
              case "thinking":
                callbacks.onThinking();
                break;
              case "action":
                callbacks.onAction(parsed as MessageAction);
                break;
              case "done":
                finished = true;
                callbacks.onDone(parsed as unknown as ChatDone);
                break;
              case "error":
                finished = true;
                callbacks.onError(parsed as { message: string });
                break;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
      if (!finished) callbacks.onDisconnect();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      // A dropped connection mid-reply; before any reply started, it's just a failed send
      callbacks.onDisconnect();
    }
  })();

  return controller;
}

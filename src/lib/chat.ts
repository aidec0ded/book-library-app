import { localToday } from "@/lib/reading-dates";
import { supabase } from "@/lib/supabase";
import type { Conversation, Message } from "@/lib/types";

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

export interface ChatCallbacks {
  onMeta: (data: { conversation_id: string }) => void;
  onText: (data: { content: string }) => void;
  onThinking: () => void;
  onDone: (data: { message_id: string }) => void;
  onError: (data: { message: string }) => void;
}

export interface SendMessageOptions {
  isOnboarding?: boolean;
  bookId?: string;
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
        if (response.status === 403) {
          try {
            const errData = await response.json();
            if (errData.error === "message_limit_reached") {
              callbacks.onError({ message: "message_limit_reached" });
              return;
            }
          } catch {
            // Fall through to generic error
          }
        }
        callbacks.onError({
          message: `Server error: ${response.status}`,
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            const parsed = JSON.parse(data) as Record<string, string>;
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
              case "done":
                callbacks.onDone(parsed as { message_id: string });
                break;
              case "error":
                callbacks.onError(parsed as { message: string });
                break;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      callbacks.onError({
        message: err instanceof Error ? err.message : "Connection failed",
      });
    }
  })();

  return controller;
}

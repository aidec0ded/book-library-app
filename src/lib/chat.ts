import { supabase } from "@/lib/supabase";
import type { Conversation, Message } from "@/lib/types";

export async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .is("archived_at", null)
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return data;
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
  onStatus: (data: { message: string }) => void;
  onDone: (data: { message_id: string }) => void;
  onError: (data: { message: string }) => void;
}

export function sendMessage(
  conversationId: string | null,
  message: string,
  callbacks: ChatCallbacks,
): AbortController {
  const controller = new AbortController();

  void (async () => {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          message,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
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
              case "status":
                callbacks.onStatus(parsed as { message: string });
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

import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchConversations,
  fetchMessages,
  sendMessage,
} from "@/lib/chat";
import type { Conversation, Message } from "@/lib/types";

const SESSION_KEY = "moodlib_conversation_id";

export interface UseChatSessionReturn {
  conversationId: string | null;
  messages: Message[];
  conversations: Conversation[];
  conversationsLoading: boolean;
  input: string;
  streaming: boolean;
  streamingContent: string;
  error: string | null;
  messageLimitReached: boolean;
  setInput: (text: string) => void;
  send: (text?: string) => void;
  selectConversation: (id: string) => void;
  newChat: () => void;
}

export interface UseChatSessionOptions {
  onboarding?: boolean;
}

export function useChatSession(options?: UseChatSessionOptions): UseChatSessionReturn {
  const isOnboarding = options?.onboarding ?? false;

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(!isOnboarding);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [messageLimitReached, setMessageLimitReached] = useState(false);

  const streamingContentRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  // Load conversations on mount (skip for onboarding)
  useEffect(() => {
    if (isOnboarding) return;
    void (async () => {
      try {
        const convs = await fetchConversations();
        setConversations(convs);
      } catch {
        // Non-critical
      } finally {
        setConversationsLoading(false);
      }
    })();
  }, [isOnboarding]);

  // Restore session on mount (skip for onboarding)
  useEffect(() => {
    if (isOnboarding) return;
    const savedId = sessionStorage.getItem(SESSION_KEY);
    if (savedId) {
      void loadConversation(savedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnboarding]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const msgs = await fetchMessages(id);
      setMessages(msgs);
      setConversationId(id);
      if (!isOnboarding) {
        sessionStorage.setItem(SESSION_KEY, id);
      }
    } catch {
      setError("Failed to load conversation.");
    }
  }, [isOnboarding]);

  const newChat = useCallback(() => {
    if (!isOnboarding) {
      sessionStorage.removeItem(SESSION_KEY);
    }
    setConversationId(null);
    setMessages([]);
    setStreamingContent("");
    setError(null);
  }, [isOnboarding]);

  const selectConversation = useCallback(
    (id: string) => {
      if (id === conversationId) return;
      if (streaming) return;
      void loadConversation(id);
    },
    [conversationId, streaming, loadConversation],
  );

  const send = useCallback(
    (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || streaming) return;

      setError(null);

      const tempMessage: Message = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId ?? "",
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempMessage]);
      if (!text) setInput("");
      setStreaming(true);
      setStreamingContent("");
      streamingContentRef.current = "";

      const controller = sendMessage(
        conversationId,
        content,
        {
          onMeta: ({ conversation_id }) => {
            setConversationId(conversation_id);
            if (!isOnboarding) {
              sessionStorage.setItem(SESSION_KEY, conversation_id);
            }
          },
          onText: ({ content: chunk }) => {
            streamingContentRef.current += chunk;
            setStreamingContent(streamingContentRef.current);
          },
          onDone: ({ message_id }) => {
            const finalContent = streamingContentRef.current;
            setMessages((prev) => [
              ...prev,
              {
                id: message_id,
                conversation_id: conversationId ?? "",
                role: "assistant" as const,
                content: finalContent,
                created_at: new Date().toISOString(),
              },
            ]);
            setStreamingContent("");
            streamingContentRef.current = "";
            setStreaming(false);

            if (!isOnboarding) {
              void fetchConversations().then(setConversations).catch(() => {});
            }
          },
          onError: ({ message }) => {
            if (message === "message_limit_reached") {
              setMessageLimitReached(true);
              // Remove the optimistic user message
              setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
            } else {
              setError(message);
            }
            setStreaming(false);
          },
        },
        isOnboarding ? { isOnboarding: true } : undefined,
      );

      abortRef.current = controller;
    },
    [input, streaming, conversationId, isOnboarding],
  );

  return {
    conversationId,
    messages,
    conversations,
    conversationsLoading,
    input,
    streaming,
    streamingContent,
    error,
    messageLimitReached,
    setInput,
    send,
    selectConversation,
    newChat,
  };
}

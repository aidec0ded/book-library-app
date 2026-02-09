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
  searchStatus: string | null;
  error: string | null;
  setInput: (text: string) => void;
  send: (text?: string) => void;
  selectConversation: (id: string) => void;
  newChat: () => void;
}

export function useChatSession(): UseChatSessionReturn {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const streamingContentRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  // Load conversations on mount
  useEffect(() => {
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
  }, []);

  // Restore session on mount
  useEffect(() => {
    const savedId = sessionStorage.getItem(SESSION_KEY);
    if (savedId) {
      void loadConversation(savedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const msgs = await fetchMessages(id);
      setMessages(msgs);
      setConversationId(id);
      sessionStorage.setItem(SESSION_KEY, id);
    } catch {
      setError("Failed to load conversation.");
    }
  }, []);

  const newChat = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setConversationId(null);
    setMessages([]);
    setStreamingContent("");
    setSearchStatus(null);
    setError(null);
  }, []);

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

      const controller = sendMessage(conversationId, content, {
        onMeta: ({ conversation_id }) => {
          setConversationId(conversation_id);
          sessionStorage.setItem(SESSION_KEY, conversation_id);
        },
        onStatus: ({ message }) => {
          setSearchStatus(message);
        },
        onText: ({ content: chunk }) => {
          setSearchStatus(null);
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
          setSearchStatus(null);
          setStreaming(false);

          void fetchConversations().then(setConversations).catch(() => {});
        },
        onError: ({ message }) => {
          setError(message);
          setSearchStatus(null);
          setStreaming(false);
        },
      });

      abortRef.current = controller;
    },
    [input, streaming, conversationId],
  );

  return {
    conversationId,
    messages,
    conversations,
    conversationsLoading,
    input,
    streaming,
    streamingContent,
    searchStatus,
    error,
    setInput,
    send,
    selectConversation,
    newChat,
  };
}

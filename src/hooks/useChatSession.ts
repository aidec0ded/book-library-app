import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import {
  CONVERSATION_PAGE_SIZE,
  deleteConversation,
  fetchConversation,
  fetchConversations,
  fetchConversationsForBook,
  fetchMessages,
  renameConversation,
  sendMessage,
} from "@/lib/chat";
import type { Conversation, ConversationBook, Message } from "@/lib/types";
import { capture } from "@/lib/posthog";

const SESSION_KEY = "moodlib_conversation_id";
// Titles are written just after a reply finishes, so the list is checked again a moment later
const TITLE_REFRESH_DELAY_MS = 5000;

export interface UseChatSessionReturn {
  conversationId: string | null;
  /** The book this conversation is about, including one about to start. */
  book: ConversationBook | null;
  title: string | null;
  messages: Message[];
  conversations: Conversation[];
  conversationsLoading: boolean;
  hasMoreConversations: boolean;
  excerptsVersion: number;
  input: string;
  streaming: boolean;
  thinking: boolean;
  streamingContent: string;
  error: string | null;
  messageLimitReached: boolean;
  setInput: Dispatch<SetStateAction<string>>;
  send: (text?: string) => void;
  selectConversation: (id: string) => void;
  newChat: (book?: ConversationBook | null) => void;
  /** Resume the latest conversation about a book, or start one. Returns whether it resumed. */
  openBookConversation: (book: ConversationBook) => Promise<boolean>;
  loadMoreConversations: () => void;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  notifyExcerptSaved: () => void;
}

export interface UseChatSessionOptions {
  onboarding?: boolean;
}

export function useChatSession(options?: UseChatSessionOptions): UseChatSessionReturn {
  const isOnboarding = options?.onboarding ?? false;

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [book, setBook] = useState<ConversationBook | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [conversationLimit, setConversationLimit] = useState(CONVERSATION_PAGE_SIZE);
  const [excerptsVersion, setExcerptsVersion] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(!isOnboarding);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [messageLimitReached, setMessageLimitReached] = useState(false);

  const streamingContentRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  // Replies and loads that were left behind by moving to another conversation are ignored
  const activeStreamRef = useRef(0);
  const activeLoadRef = useRef(0);

  // Load conversations on mount and as more are asked for (skip for onboarding)
  useEffect(() => {
    if (isOnboarding) return;
    void (async () => {
      try {
        const convs = await fetchConversations(conversationLimit);
        setConversations(convs);
      } catch {
        // Non-critical
      } finally {
        setConversationsLoading(false);
      }
    })();
  }, [isOnboarding, conversationLimit]);

  // Restore session on mount (skip for onboarding)
  useEffect(() => {
    if (isOnboarding) return;
    // A conversation's own link takes priority over the one left open
    if (window.location.pathname.startsWith("/chat/")) return;
    const savedId = sessionStorage.getItem(SESSION_KEY);
    if (savedId) {
      void loadConversation(savedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnboarding]);

  /** Stop following a reply in progress. The server still finishes and saves it. */
  const leaveStream = useCallback(() => {
    activeStreamRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    streamingContentRef.current = "";
    setStreaming(false);
    setThinking(false);
    setStreamingContent("");
  }, []);

  const clearConversation = useCallback(
    (nextBook: ConversationBook | null) => {
      activeLoadRef.current += 1;
      if (!isOnboarding) {
        sessionStorage.removeItem(SESSION_KEY);
      }
      leaveStream();
      setConversationId(null);
      setBook(nextBook);
      setTitle(null);
      setMessages([]);
      setError(null);
    },
    [isOnboarding, leaveStream],
  );

  const loadConversation = useCallback(
    async (id: string) => {
      const load = ++activeLoadRef.current;
      leaveStream();
      setError(null);
      try {
        const [conversation, msgs] = await Promise.all([fetchConversation(id), fetchMessages(id)]);
        if (load !== activeLoadRef.current) return;

        if (!conversation) {
          clearConversation(null);
          setError("That conversation isn't available anymore.");
          return;
        }

        setMessages(msgs);
        setConversationId(id);
        setBook(conversation.book);
        setTitle(conversation.title);
        if (!isOnboarding) {
          sessionStorage.setItem(SESSION_KEY, id);
        }
      } catch {
        if (load === activeLoadRef.current) setError("Failed to load conversation.");
      }
    },
    [isOnboarding, leaveStream, clearConversation],
  );

  const newChat = useCallback(
    (nextBook: ConversationBook | null = null) => clearConversation(nextBook),
    [clearConversation],
  );

  const selectConversation = useCallback(
    (id: string) => {
      if (id === conversationId) return;
      void loadConversation(id);
    },
    [conversationId, loadConversation],
  );

  const openBookConversation = useCallback(
    async (nextBook: ConversationBook) => {
      // Already there, whether that's a conversation in progress or one about to start
      if (book?.id === nextBook.id && (conversationId || streaming || messages.length === 0)) {
        return Boolean(conversationId);
      }
      const [latest] = await fetchConversationsForBook(nextBook.id).catch(() => []);
      if (latest) {
        await loadConversation(latest.id);
        return true;
      }
      clearConversation(nextBook);
      return false;
    },
    [book, conversationId, streaming, messages.length, loadConversation, clearConversation],
  );

  const refreshConversations = useCallback(() => {
    if (isOnboarding) return;
    void fetchConversations(conversationLimit)
      .then((convs) => {
        setConversations(convs);
        const current = convs.find((c) => c.id === conversationIdRef.current);
        if (current) setTitle(current.title);
      })
      .catch(() => {});
  }, [isOnboarding, conversationLimit]);

  const loadMoreConversations = useCallback(() => {
    setConversationLimit((limit) => limit + CONVERSATION_PAGE_SIZE);
  }, []);

  const renameCurrent = useCallback(async (id: string, nextTitle: string) => {
    await renameConversation(id, nextTitle);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: nextTitle } : c)));
    if (id === conversationIdRef.current) setTitle(nextTitle);
  }, []);

  const deleteAndLeave = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === conversationIdRef.current) clearConversation(null);
      capture("chat_conversation_deleted");
    },
    [clearConversation],
  );

  const notifyExcerptSaved = useCallback(() => {
    setExcerptsVersion((version) => version + 1);
  }, []);

  const send = useCallback(
    (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || streaming) return;

      capture("chat_message_sent");
      setError(null);
      // Sending commits to this conversation, so one still loading shouldn't replace it
      activeLoadRef.current += 1;

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

      const stream = ++activeStreamRef.current;
      const isNewConversation = !conversationId;

      const controller = sendMessage(
        conversationId,
        content,
        {
          onMeta: ({ conversation_id }) => {
            if (stream !== activeStreamRef.current) return;
            if (!conversationIdRef.current) {
              capture("chat_conversation_started", { is_onboarding: isOnboarding });
            }
            setConversationId(conversation_id);
            if (!isOnboarding) {
              sessionStorage.setItem(SESSION_KEY, conversation_id);
            }
          },
          onText: ({ content: chunk }) => {
            if (stream !== activeStreamRef.current) return;
            setThinking(false);
            streamingContentRef.current += chunk;
            setStreamingContent(streamingContentRef.current);
          },
          onThinking: () => {
            // Server is processing tool calls — keep any text already streamed
            // (it's part of the reply) and show the thinking indicator.
            if (stream !== activeStreamRef.current) return;
            setThinking(true);
          },
          onDone: ({ message_id }) => {
            if (stream !== activeStreamRef.current) {
              refreshConversations();
              return;
            }
            const finalContent = streamingContentRef.current;
            setMessages((prev) => [
              ...prev,
              {
                id: message_id,
                conversation_id: conversationIdRef.current ?? "",
                role: "assistant" as const,
                content: finalContent,
                created_at: new Date().toISOString(),
              },
            ]);
            setStreamingContent("");
            streamingContentRef.current = "";
            setStreaming(false);
            setThinking(false);

            refreshConversations();
            if (isNewConversation) {
              setTimeout(refreshConversations, TITLE_REFRESH_DELAY_MS);
            }
          },
          onError: ({ message }) => {
            if (stream !== activeStreamRef.current) return;
            if (message === "message_limit_reached") {
              setMessageLimitReached(true);
              // Remove the optimistic user message
              setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
            } else {
              setError(message);
            }
            setStreaming(false);
            setThinking(false);
          },
        },
        isOnboarding ? { isOnboarding: true } : { bookId: book?.id },
      );

      abortRef.current = controller;
    },
    [input, streaming, conversationId, book, isOnboarding, refreshConversations],
  );

  return {
    conversationId,
    book,
    title,
    messages,
    conversations,
    conversationsLoading,
    hasMoreConversations: conversations.length >= conversationLimit,
    excerptsVersion,
    input,
    streaming,
    thinking,
    streamingContent,
    error,
    messageLimitReached,
    setInput,
    send,
    selectConversation,
    newChat,
    openBookConversation,
    loadMoreConversations,
    renameConversation: renameCurrent,
    deleteConversation: deleteAndLeave,
    notifyExcerptSaved,
  };
}

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
  stopReply,
} from "@/lib/chat";
import type { Conversation, ConversationBook, Message, MessageAction } from "@/lib/types";
import { capture } from "@/lib/posthog";

const SESSION_KEY = "moodlib_conversation_id";
// Titles are written just after a reply finishes, so the list is checked again a moment later
const TITLE_REFRESH_DELAY_MS = 5000;
// After a dropped connection, how long to look for the reply the server went on to save
const REPLY_CHECK_INTERVAL_MS = 3000;
const REPLY_WAIT_MS = 2 * 60 * 1000;
// Errors the reader fixes by changing what they send, not by sending it again
const NOT_RETRYABLE = new Set(["message_limit_reached", "monthly_cap_reached", "message_too_long"]);

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
  /** Changes made so far in the reply being written */
  streamingActions: MessageAction[];
  /** The connection dropped mid-reply, and the chat is checking for the reply the server saved */
  waitingForReply: boolean;
  error: string | null;
  /** Whether the failed message can be sent again as it is */
  canRetry: boolean;
  /** What a reply had written before it failed or the connection dropped */
  failedReply: string;
  messageLimitReached: boolean;
  setInput: Dispatch<SetStateAction<string>>;
  send: (text?: string) => void;
  /** Send the last message again after its reply failed */
  retry: () => void;
  /** End the reply being written. What it wrote so far is kept. */
  stop: () => void;
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
  /** The companion changed something in the library, so pages showing it are out of date */
  onLibraryChange?: () => void;
  /** The server's count of replies used this month, after each reply */
  onUsage?: (messagesUsed: number) => void;
  /** A reply arrived without its count (after a dropped connection), so fetch it again */
  onUsageStale?: () => void;
}

export function useChatSession(options?: UseChatSessionOptions): UseChatSessionReturn {
  const isOnboarding = options?.onboarding ?? false;
  const optionsRef = useRef(options);
  optionsRef.current = options;

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
  const [streamingActions, setStreamingActions] = useState<MessageAction[]>([]);
  const [waitingForReply, setWaitingForReply] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [failedReply, setFailedReply] = useState("");
  const [messageLimitReached, setMessageLimitReached] = useState(false);

  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const streamingContentRef = useRef("");
  const streamingActionsRef = useRef<MessageAction[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  const stopRequestedRef = useRef(false);
  // Replies, loads, and checks that were left behind by moving to another conversation are ignored
  const activeStreamRef = useRef(0);
  const activeLoadRef = useRef(0);
  const activeWaitRef = useRef(0);

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

  const clearProblem = useCallback(() => {
    setError(null);
    setCanRetry(false);
    setFailedReply("");
    setWaitingForReply(false);
    activeWaitRef.current += 1;
  }, []);

  /** Stop following a reply in progress. The server still finishes and saves it. */
  const leaveStream = useCallback(() => {
    activeStreamRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    streamingContentRef.current = "";
    streamingActionsRef.current = [];
    setStreaming(false);
    setThinking(false);
    setStreamingContent("");
    setStreamingActions([]);
  }, []);

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

  /**
   * The server keeps writing a reply after the connection drops, then saves it. Look for it
   * for a couple of minutes; if it never comes, offer to send the message again. `known` is
   * what was saved before the message, so an earlier reply isn't taken for this one, and
   * `content` is the message, to tell when it never reached the server at all.
   */
  const waitForReply = useCallback(
    (id: string, partial: string, known: Set<string>, content: string) => {
      const wait = ++activeWaitRef.current;
      setWaitingForReply(true);
      setFailedReply(partial);
      setError(null);
      const started = Date.now();
      let checksWithoutMessage = 0;

      const check = async () => {
        if (wait !== activeWaitRef.current) return;
        try {
          const msgs = await fetchMessages(id);
          if (wait !== activeWaitRef.current) return;
          const last = msgs[msgs.length - 1];
          if (last?.role === "assistant" && !known.has(last.id)) {
            setMessages(msgs);
            setWaitingForReply(false);
            setFailedReply("");
            if (last.actions?.some((a) => a.label && !a.failed)) optionsRef.current?.onLibraryChange?.();
            optionsRef.current?.onUsageStale?.();
            refreshConversations();
            return;
          }
          // The message isn't saved, so no reply is coming: it never reached the server
          if (!(last?.role === "user" && last.content === content) && ++checksWithoutMessage >= 2) {
            setWaitingForReply(false);
            setError("Your message didn't reach the companion.");
            setCanRetry(true);
            return;
          }
        } catch {
          // Try again on the next check
        }
        if (Date.now() - started >= REPLY_WAIT_MS) {
          setWaitingForReply(false);
          setError("The reply didn't come through.");
          setCanRetry(true);
          return;
        }
        setTimeout(() => void check(), REPLY_CHECK_INTERVAL_MS);
      };
      setTimeout(() => void check(), REPLY_CHECK_INTERVAL_MS);
    },
    [refreshConversations],
  );

  const clearConversation = useCallback(
    (nextBook: ConversationBook | null) => {
      activeLoadRef.current += 1;
      if (!isOnboarding) {
        sessionStorage.removeItem(SESSION_KEY);
      }
      leaveStream();
      clearProblem();
      setConversationId(null);
      setBook(nextBook);
      setTitle(null);
      setMessages([]);
    },
    [isOnboarding, leaveStream, clearProblem],
  );

  const loadConversation = useCallback(
    async (id: string) => {
      const load = ++activeLoadRef.current;
      leaveStream();
      clearProblem();
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

        // Left before the last reply arrived: it may still be on its way, or it may have failed
        const last = msgs[msgs.length - 1];
        if (last?.role === "user") {
          if (Date.now() - new Date(last.created_at).getTime() < REPLY_WAIT_MS) {
            waitForReply(id, "", new Set(msgs.map((m) => m.id)), last.content);
          } else {
            setError("This message didn't get a reply.");
            setCanRetry(true);
          }
        }
      } catch {
        if (load === activeLoadRef.current) setError("Failed to load conversation.");
      }
    },
    [isOnboarding, leaveStream, clearProblem, clearConversation, waitForReply],
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

  /** Start the reply to a message already on screen. */
  const startReply = useCallback(
    (content: string, retry: boolean) => {
      setStreaming(true);
      setThinking(false);
      setStreamingContent("");
      setStreamingActions([]);
      streamingContentRef.current = "";
      streamingActionsRef.current = [];
      stopRequestedRef.current = false;

      const stream = ++activeStreamRef.current;
      const startedIn = conversationIdRef.current;
      const isNewConversation = !startedIn;
      // What was saved before this message, to recognize its reply after a dropped connection
      const known = new Set(messagesRef.current.filter((m) => !m.id.startsWith("temp-")).map((m) => m.id));
      const current = () => stream === activeStreamRef.current;

      const endStream = () => {
        setStreaming(false);
        setThinking(false);
        setStreamingContent("");
        setStreamingActions([]);
      };

      const controller = sendMessage(
        startedIn,
        content,
        {
          onMeta: ({ conversation_id }) => {
            if (!current()) return;
            if (!conversationIdRef.current) {
              capture("chat_conversation_started", { is_onboarding: isOnboarding });
            }
            conversationIdRef.current = conversation_id;
            setConversationId(conversation_id);
            if (!isOnboarding) {
              sessionStorage.setItem(SESSION_KEY, conversation_id);
            }
            // Stop was pressed before the conversation had an ID
            if (stopRequestedRef.current) void stopReply(conversation_id).catch(() => {});
          },
          onText: ({ content: chunk }) => {
            if (!current()) return;
            setThinking(false);
            streamingContentRef.current += chunk;
            setStreamingContent(streamingContentRef.current);
          },
          onThinking: () => {
            // Server is processing tool calls — keep any text already streamed
            // (it's part of the reply) and show the thinking indicator.
            if (!current()) return;
            setThinking(true);
          },
          onAction: (action) => {
            if (!current()) return;
            streamingActionsRef.current = [...streamingActionsRef.current, action];
            setStreamingActions(streamingActionsRef.current);
            if (!action.failed) optionsRef.current?.onLibraryChange?.();
          },
          onDone: ({ message_id, messages_used, unsent }) => {
            if (typeof messages_used === "number") optionsRef.current?.onUsage?.(messages_used);
            if (!current()) {
              refreshConversations();
              return;
            }
            if (unsent) {
              // Stopped before any reply: the message comes back to the box, unsent
              setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
              setInput((typed) => (typed.trim() ? typed : content));
              streamingContentRef.current = "";
              streamingActionsRef.current = [];
              endStream();
              // A conversation this message started is gone with it
              if (isNewConversation) clearConversation(book);
              refreshConversations();
              return;
            }
            if (message_id) {
              const reply: Message = {
                id: message_id,
                conversation_id: conversationIdRef.current ?? "",
                role: "assistant",
                content: streamingContentRef.current,
                created_at: new Date().toISOString(),
                actions: streamingActionsRef.current,
              };
              setMessages((prev) => [...prev, reply]);
            }
            streamingContentRef.current = "";
            streamingActionsRef.current = [];
            endStream();

            refreshConversations();
            if (isNewConversation) {
              setTimeout(refreshConversations, TITLE_REFRESH_DELAY_MS);
            }
          },
          onError: ({ message, code, messages_used }) => {
            if (!current()) return;
            if (typeof messages_used === "number") optionsRef.current?.onUsage?.(messages_used);
            const partial = streamingContentRef.current;
            endStream();

            if (code && NOT_RETRYABLE.has(code)) {
              // Nothing was sent: take the message back off the screen and return it to the box
              setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
              if (!retry) setInput((typed) => (typed.trim() ? typed : content));
              if (code === "message_limit_reached") {
                setMessageLimitReached(true);
              } else {
                setError(message);
              }
              return;
            }

            setFailedReply(partial);
            setError(message);
            setCanRetry(true);
          },
          onDisconnect: () => {
            if (!current()) return;
            const partial = streamingContentRef.current;
            endStream();
            const id = conversationIdRef.current;
            if (id) {
              waitForReply(id, partial, known, content);
            } else {
              setError("Couldn't reach the server. Check your connection and try again.");
              setCanRetry(true);
            }
          },
        },
        isOnboarding ? { isOnboarding: true, retry } : { bookId: book?.id, retry },
      );

      abortRef.current = controller;
    },
    [book, isOnboarding, refreshConversations, waitForReply, clearConversation],
  );

  const send = useCallback(
    (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || streaming || waitingForReply) return;

      capture("chat_message_sent");
      clearProblem();
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
      startReply(content, false);
    },
    [input, streaming, waitingForReply, conversationId, clearProblem, startReply],
  );

  const retry = useCallback(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user" || streaming) return;
    capture("chat_message_retried");
    clearProblem();
    activeLoadRef.current += 1;
    const load = activeLoadRef.current;
    const id = conversationIdRef.current;

    void (async () => {
      // The reply may have been saved after all; sending again would answer the message twice
      if (id) {
        const saved = await fetchMessages(id).catch(() => null);
        if (load !== activeLoadRef.current) return;
        const savedLast = saved?.[saved.length - 1];
        if (saved && savedLast?.role === "assistant" && !messages.some((m) => m.id === savedLast.id)) {
          setMessages(saved);
          optionsRef.current?.onUsageStale?.();
          return;
        }
      }
      startReply(last.content, true);
    })();
  }, [messages, streaming, clearProblem, startReply]);

  const stop = useCallback(() => {
    if (!streaming || stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    capture("chat_reply_stopped");
    // Before the conversation has an ID, the stop is sent as soon as it does (see onMeta)
    const id = conversationIdRef.current;
    if (id) void stopReply(id).catch(() => {});
  }, [streaming]);

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
    streamingActions,
    waitingForReply,
    error,
    canRetry,
    failedReply,
    messageLimitReached,
    setInput,
    send,
    retry,
    stop,
    selectConversation,
    newChat,
    openBookConversation,
    loadMoreConversations,
    renameConversation: renameCurrent,
    deleteConversation: deleteAndLeave,
    notifyExcerptSaved,
  };
}

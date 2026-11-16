import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useChatSession } from "@/hooks/useChatSession";
import type { UseChatSessionReturn } from "@/hooks/useChatSession";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { invalidateLibraryTitles } from "@/lib/book-titles";
import type { ConversationBook } from "@/lib/types";

interface OpenPanelOptions {
  book?: ConversationBook;
  /** Suggested first message, for a conversation that's just starting. */
  prefill?: string;
}

interface ChatContextValue extends UseChatSessionReturn {
  /** Goes up each time the companion changes something in the library */
  libraryVersion: number;
  panelOpen: boolean;
  openPanel: (options?: OpenPanelOptions) => void;
  closePanel: () => void;
  togglePanel: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { setChatMessagesUsed, refreshSubscription } = useSubscription();
  const [libraryVersion, setLibraryVersion] = useState(0);
  const session = useChatSession({
    onLibraryChange: () => {
      invalidateLibraryTitles();
      setLibraryVersion((version) => version + 1);
    },
    onUsage: setChatMessagesUsed,
    onUsageStale: () => void refreshSubscription(),
  });
  const [panelOpen, setPanelOpen] = useState(false);

  const openPanel = useCallback(
    (options?: OpenPanelOptions) => {
      setPanelOpen(true);
      if (!options?.book) return;

      void session.openBookConversation(options.book).then((resumed) => {
        // Never replaces something the reader has already typed
        if (!resumed && options.prefill) {
          const prefill = options.prefill;
          session.setInput((typed) => (typed.trim() ? typed : prefill));
        }
      });
    },
    [session],
  );

  const closePanel = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const togglePanel = useCallback(() => {
    setPanelOpen((prev) => !prev);
  }, []);

  return (
    <ChatContext.Provider
      value={{
        ...session,
        libraryVersion,
        panelOpen,
        openPanel,
        closePanel,
        togglePanel,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

/**
 * Run `onChange` when the companion changes something in the library while this page is open,
 * so a page behind the chat panel shows the change. Not run when the page first loads.
 */
export function useLibraryChanges(onChange: () => void): void {
  const version = useContext(ChatContext)?.libraryVersion ?? 0;
  const seen = useRef(version);
  const callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    if (version === seen.current) return;
    seen.current = version;
    callback.current();
  }, [version]);
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
}

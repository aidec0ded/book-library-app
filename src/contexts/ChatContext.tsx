import { createContext, useContext, useState, useCallback } from "react";
import { useChatSession } from "@/hooks/useChatSession";
import type { UseChatSessionReturn } from "@/hooks/useChatSession";
import type { ConversationBook } from "@/lib/types";

interface OpenPanelOptions {
  book?: ConversationBook;
  /** Suggested first message, for a conversation that's just starting. */
  prefill?: string;
}

interface ChatContextValue extends UseChatSessionReturn {
  panelOpen: boolean;
  openPanel: (options?: OpenPanelOptions) => void;
  closePanel: () => void;
  togglePanel: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const session = useChatSession();
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

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
}

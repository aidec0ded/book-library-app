import { createContext, useContext, useState, useCallback } from "react";
import { useChatSession } from "@/hooks/useChatSession";
import type { UseChatSessionReturn } from "@/hooks/useChatSession";

interface ChatContextValue extends UseChatSessionReturn {
  panelOpen: boolean;
  openPanel: (options?: { bookTitle?: string }) => void;
  closePanel: () => void;
  togglePanel: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const session = useChatSession();
  const [panelOpen, setPanelOpen] = useState(false);

  const openPanel = useCallback(
    (options?: { bookTitle?: string }) => {
      setPanelOpen(true);
      if (options?.bookTitle) {
        session.setInput(`Let's discuss "${options.bookTitle}"`);
      }
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

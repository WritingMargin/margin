import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const ConversationTarget = createContext<{
  revision: number;
  refresh: () => void;
  target: HTMLDivElement | null;
  setTarget: (target: HTMLDivElement | null) => void;
} | null>(null);

export function ConversationToolsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const value = useMemo(
    () => ({ target, setTarget, revision, refresh }),
    [target, revision, refresh],
  );
  return (
    <ConversationTarget.Provider value={value}>
      {children}
    </ConversationTarget.Provider>
  );
}

export function ConversationToolsSlot() {
  const context = useContext(ConversationTarget);
  return <div className="conversation-tools" ref={context?.setTarget} />;
}

export function ConversationTools({ children }: { children: ReactNode }) {
  const context = useContext(ConversationTarget);
  // Keep reader tools available when a publication hides its comments.
  return context?.target ? createPortal(children, context.target) : children;
}

const standaloneRefresh = { revision: 0, refresh: () => {} };
export function useConversationRefresh() {
  return useContext(ConversationTarget) ?? standaloneRefresh;
}

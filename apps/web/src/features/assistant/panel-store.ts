import { useSyncExternalStore } from 'react';

/** The Assistant side panel: open or not, which conversation, and a question to ask on opening. */
interface PanelState {
  open: boolean;
  conversationId: string | null;
  question: string | null;
  /**
   * Changes only on deliberate switches (new chat, another conversation, a new question), so a
   * conversation getting its id mid-stream doesn't remount the thread.
   */
  viewKey: number;
}

let state: PanelState = { open: false, conversationId: null, question: null, viewKey: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<PanelState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const assistantPanel = {
  open() {
    set({ open: true });
  },
  /** Ask in a fresh conversation (command palette). */
  ask(question: string) {
    set({ open: true, conversationId: null, question, viewKey: state.viewKey + 1 });
  },
  newConversation() {
    set({ conversationId: null, question: null, viewKey: state.viewKey + 1 });
  },
  select(conversationId: string) {
    set({ conversationId, question: null, viewKey: state.viewKey + 1 });
  },
  /** The thread created its conversation; remember it without remounting. */
  adopt(conversationId: string) {
    set({ conversationId, question: null });
  },
  close() {
    set({ open: false, question: null });
  },
};

export const useAssistantPanel = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

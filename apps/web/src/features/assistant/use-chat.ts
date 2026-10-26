import type { ChatPart, ChatStreamEvent } from '@stockroom/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { chatKeys, createConversation, streamMessage } from './api';

export interface LiveTool {
  name: string;
  label: string;
  status: 'running' | 'done' | 'error';
}

/** The turn being streamed: the question, the answer so far, tools in use, cards and charts. */
export interface LiveTurn {
  question: string;
  text: string;
  tools: LiveTool[];
  parts: ChatPart[];
  runId: string | null;
  error: string | null;
}

function reduce(t: LiveTurn, e: ChatStreamEvent): LiveTurn {
  switch (e.type) {
    case 'start':
      return { ...t, runId: e.runId };
    case 'text':
      return { ...t, text: t.text + e.delta };
    case 'reset':
      return { ...t, text: '' };
    case 'tool': {
      if (e.status === 'running')
        return { ...t, tools: [...t.tools, { name: e.name, label: e.label, status: 'running' }] };
      const i = t.tools.map((x) => x.name === e.name && x.status === 'running').lastIndexOf(true);
      if (i < 0) return { ...t, tools: [...t.tools, { name: e.name, label: e.label, status: e.status }] };
      return {
        ...t,
        tools: t.tools.map((x, j) => (j === i ? { ...x, label: e.label, status: e.status } : x)),
      };
    }
    case 'part':
      return { ...t, parts: [...t.parts, e.part] };
    case 'error':
      return { ...t, error: e.message };
    case 'done':
      return t;
  }
}

/** Sending, streaming and stopping one conversation's turns. */
export function useChat(conversationId: string | null, onConversation: (id: string) => void) {
  const qc = useQueryClient();
  const [live, setLive] = useState<LiveTurn | null>(null);
  const abort = useRef<AbortController | null>(null);

  const send = async (content: string) => {
    if (abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    setLive({ question: content, text: '', tools: [], parts: [], runId: null, error: null });
    let id = conversationId;
    try {
      if (!id) {
        id = (await createConversation()).id;
        onConversation(id);
      }
      await streamMessage(id, content, (e) => setLive((t) => (t ? reduce(t, e) : t)), controller.signal);
      await Promise.all([
        qc.invalidateQueries({ queryKey: chatKeys.detail(id) }),
        qc.invalidateQueries({ queryKey: chatKeys.list }),
      ]);
      setLive(null);
    } catch (e) {
      setLive((t) => (t ? { ...t, error: e instanceof Error ? e.message : 'Something went wrong.' } : t));
    } finally {
      abort.current = null;
    }
  };

  return {
    live,
    busy: live !== null && live.error === null,
    send: (content: string) => void send(content),
    stop: () => abort.current?.abort(),
    clearError: () => setLive((t) => (t?.error ? null : t)),
  };
}

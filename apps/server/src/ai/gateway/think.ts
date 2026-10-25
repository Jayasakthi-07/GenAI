const OPEN = /<(think|thinking|reasoning)>/i;

/**
 * Separates `<think>…</think>` blocks (DeepSeek-R1, QwQ and others emit them inline) from the
 * answer, so reasoning never breaks JSON parsing and can be stored and shown collapsed.
 */
export function splitThinking(text: string): { content: string; reasoning: string | null } {
  if (!OPEN.test(text)) return { content: text, reasoning: null };
  const parts: string[] = [];
  let content = text.replace(/<(think|thinking|reasoning)>([\s\S]*?)<\/\1>/gi, (_, _tag, inner: string) => {
    parts.push(inner.trim());
    return '';
  });
  // An unclosed block (truncated output) is reasoning up to the end.
  const open = OPEN.exec(content);
  if (open) {
    parts.push(content.slice(open.index + open[0].length).trim());
    content = content.slice(0, open.index);
  }
  return { content: content.trim(), reasoning: parts.filter(Boolean).join('\n\n') || null };
}

/** Streaming version: feed deltas, get answer and reasoning deltas back. */
export class ThinkStreamSplitter {
  private inThink = false;
  private pending = '';

  push(delta: string): { text: string; reasoning: string } {
    let text = '';
    let reasoning = '';
    let s = this.pending + delta;
    this.pending = '';
    for (;;) {
      const tag = this.inThink ? /<\/(think|thinking|reasoning)>/i : OPEN;
      const m = tag.exec(s);
      if (!m) {
        // Keep a possible partial tag at the end for the next delta.
        const lt = s.lastIndexOf('<');
        if (lt >= 0 && s.length - lt < 14 && !s.slice(lt).includes('>')) {
          this.pending = s.slice(lt);
          s = s.slice(0, lt);
        }
        if (this.inThink) reasoning += s;
        else text += s;
        return { text, reasoning };
      }
      if (this.inThink) reasoning += s.slice(0, m.index);
      else text += s.slice(0, m.index);
      this.inThink = !this.inThink;
      s = s.slice(m.index + m[0].length);
    }
  }
}

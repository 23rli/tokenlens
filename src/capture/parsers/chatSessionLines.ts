export interface ChatSessionLine {
  kind?: number;
  k?: (string | number)[];
  v?: any;
}

/** Decode a Copilot chat-session JSONL source once for all downstream parsers. */
export function parseChatSessionLines(content: string): ChatSessionLine[] {
  const parsed: ChatSessionLine[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      parsed.push(JSON.parse(line) as ChatSessionLine);
    } catch {
      // Copilot can be appending the final line while it is read. Ignore that
      // incomplete record; the source signature will trigger another read.
    }
  }
  return parsed;
}

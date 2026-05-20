export type NoteEntryDraft =
  | {
      kind: "plain";
      content: string;
    }
  | {
      kind: "project";
      content: string;
      projectTitle: string;
      projectId: string | null;
    };

export function parseNoteEntries(rawValue: string): NoteEntryDraft[] {
  return rawValue
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[\[p\|([^|]*)\|([^|\]]*)\]\](.*)$/);
      if (!match) {
        return {
          kind: "plain",
          content: line.replace(/^\s*•\s?/, "").trim()
        } satisfies NoteEntryDraft;
      }

      const [, encodedTitle, encodedId, content] = match;
      return {
        kind: "project",
        projectTitle: decodeURIComponent(encodedTitle || ""),
        projectId: encodedId ? decodeURIComponent(encodedId) : null,
        content: content.trim()
      } satisfies NoteEntryDraft;
    })
    .filter((entry) => entry.content);
}

export function serializeNoteEntries(entries: NoteEntryDraft[]) {
  return entries
    .map((entry) => {
      if (entry.kind === "plain") {
        return entry.content.trim();
      }

      return `[[p|${encodeURIComponent(entry.projectTitle)}|${encodeURIComponent(entry.projectId ?? "")}]]${entry.content.trim()}`;
    })
    .filter(Boolean)
    .join("\n");
}

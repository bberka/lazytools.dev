/**
 * Splits a text into matched and unmatched stretches so a match preview can
 * highlight the matched ones. Shared by Find and Replace and the Regex Tester.
 */

export interface TextMatch {
  /** Where the match starts in the text, in UTF-16 units. */
  index: number;
  text: string;
}

export interface TextSegment {
  text: string;
  isMatch: boolean;
}

/**
 * `matches` must be in text order and must not overlap, which is what a global
 * regex search yields. Empty matches are kept as empty segments so the preview
 * can mark their position. Joining the segment texts gives back `text`.
 */
export function splitAtMatches(text: string, matches: readonly TextMatch[]): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isMatch: false });
    }

    segments.push({ text: match.text, isMatch: true });
    lastIndex = match.index + match.text.length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isMatch: false });
  }

  return segments;
}

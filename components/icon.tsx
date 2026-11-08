import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  activity: "M3 12h4l3-8 4 16 3-8h4", wallet: "M20 8V5H4a2 2 0 0 1 0-4h14v4 M4 5a2 2 0 0 0-2 2v13h18V8H4 M16 12h6v5h-6z",
  bill: "M6 3h12v19l-3-2-3 2-3-2-3 2V3z M9 8h6 M9 12h6",
  sparkle: "m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z",
  arrow: "M5 12h14 M13 6l6 6-6 6", up: "M12 19V5 M5 12l7-7 7 7",
  chevron: "m9 5 7 7-7 7", check: "m5 12 4 4L19 6", close: "m6 6 12 12 M6 18 18 6",
  undo: "M8 4 3 9l5 5 M3 9h10a7 7 0 0 1 0 14", reset: "M3 10a9 9 0 1 1 2 9 M3 3v7h7",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  shield: "m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4z m-4 10 3 3 5-6",
  card: "M3 5h18v14H3z M3 9h18 M6 15h4", plus: "M12 5v14 M5 12h14",
  calendar: "M4 5h16v16H4z M8 2v6 M16 2v6 M4 10h16",
  code: "m8 6-6 6 6 6 m8-12 6 6-6 6 m-3-15-2 18",
};
export function Icon({ name, size = 20, style }: { name: string; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name] || paths.sparkle} /></svg>;
}

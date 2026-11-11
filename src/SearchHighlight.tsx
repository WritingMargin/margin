import "./search-highlight.css";

export default function SearchHighlight({ text, matches = [] }: { text: string; matches?: string[] }) {
  if (!matches.length) return <>{text}</>;
  const matching = new Set(matches);
  return <>{text.split(/([\p{L}\p{N}\p{M}]+)/u).map((part, index) =>
    matching.has(part) ? <mark className="search-highlight" key={index}>{part}</mark> : part,
  )}</>;
}

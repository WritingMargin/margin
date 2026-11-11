import { Search, X } from "lucide-react";
import { useRef } from "react";

export default function PostsSearch({ query, onChange }: {
  query: string;
  onChange: (query: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="posts-list-search" role="search" aria-label="Search all posts">
      <Search size={16} aria-hidden="true" />
      <input
        ref={input}
        type="search"
        aria-label="Search all posts"
        placeholder="Search titles or content…"
        value={query}
        onChange={(event) => onChange(event.target.value)}
      />
      {query && (
        <button type="button" aria-label="Clear post search" onClick={() => {
          onChange("");
          input.current?.focus();
        }}><X size={16} aria-hidden="true" /></button>
      )}
    </div>
  );
}

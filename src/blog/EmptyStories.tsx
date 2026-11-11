import type { PublicationCopy } from "../../shared/publication";
type Props = { words: PublicationCopy; hasPosts: number; onReset: () => void };
export default function EmptyStories({ words, hasPosts, onReset }: Props) {
  return (
    <div className="journal-empty">
      <span className="eyebrow">
        {hasPosts ? "KEEP LOOKING" : "A BLANK PAGE IS A BEGINNING"}
      </span>
      <h2>
        {hasPosts
          ? `No ${words.plural} match just yet.`
          : "Something good is taking shape."}
      </h2>
      <p>
        {hasPosts
          ? "Try another search or explore a different topic."
          : `The first ${words.singular} is still in the making. Come back soon.`}
      </p>
      {hasPosts > 0 && (
        <button className="button" onClick={onReset}>
          Show all {words.plural}
        </button>
      )}
    </div>
  );
}

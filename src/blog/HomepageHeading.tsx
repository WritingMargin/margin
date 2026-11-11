import { ArrowDown } from "lucide-react";
import { publicationCopy } from "../../shared/publication";
import { feedRowStyle } from "./feed-style";
import type { BlogHomepageController } from "./useHomepage";

export default function HomepageHeading({ state }: { state: BlogHomepageController }) {
  const { design, data } = state;
  const header = design.feedHeader ?? {};
  const words = publicationCopy(state.theme.publicationType);
  if (design.showFeedHeading === false && design.showPostCount === false) return null;
  const title = header.title ?? words.heading;
  return <div className="journal-section-title" data-feed-border={header.border} style={feedRowStyle(header)}>
    {design.showFeedHeading !== false && <span>{title}</span>}
    {design.showPostCount !== false && <span className="journal-feed-count">
      {data.total} {(data.total === 1 ? words.singular : words.plural).toUpperCase()}
      {header.showArrow !== false && <ArrowDown aria-hidden="true" size={13} />}
    </span>}
  </div>;
}

import type { PublicTheme } from "../../shared/frontend";
import type { Post } from "../../shared/types";
import { publicationCopy } from "../../shared/publication";
import PassagePopover, { type PassageAnchor } from "./PassagePopover";
import PassageQuestionForm from "./PassageQuestionForm";

export default function QuestionComposer({
  anchor,
  theme,
  post,
  quote,
  occurrence,
  onClose,
}: {
  anchor: PassageAnchor;
  theme: PublicTheme;
  post: Post;
  quote: string;
  occurrence?: number;
  onClose: () => void;
}) {
  const noun = publicationCopy(theme.publicationType || "blog").singular;
  return (
    <PassagePopover
      anchor={anchor}
      heading={`Ask about this ${noun}`}
      wide
      onClose={onClose}
    >
      <blockquote>{quote}</blockquote>
      <PassageQuestionForm
        postId={post.id}
        theme={theme}
        quote={quote}
        occurrence={occurrence}
        revision={post.revision || ""}
      />
    </PassagePopover>
  );
}

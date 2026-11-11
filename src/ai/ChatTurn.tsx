import SceneReply from "./SceneReply";
import ReplyMarkdown from "./ReplyMarkdown";
import "../markdown.css";
import "./reply-markdown.css";
import Accordion from "../Accordion";
import { Copy, Feather } from "lucide-react";
import type { Post } from "../../shared/types";
import {
  copyWritingPlan,
  type WritingTurn,
  type WritingSession,
} from "../../shared/writing";
import ResearchActionCards from "../research/ResearchActionCards";
import { WritingResults } from "./WritingResults";
import ChatFormatting from "./ChatFormatting";
import ChatActivity from "./ChatActivity";

type Props = {
  turn: WritingTurn;
  index: number;
  post: Post;
  session: WritingSession;
  onChange: (patch: Partial<WritingSession>) => void;
  insert: (before: string, after?: string) => void;
  selection: () => string;
  manage: (view: "sources" | "notes") => void;
  keep: (turn: WritingTurn, title: string, body: string) => void;
  refine: (text: string) => void;
  copied: string;
  copy: (text: string, id: string) => void;
  updateFormatting: (id: string, action: "apply" | "undo") => void;
  choose: (text: string) => void;
};
export default function ChatTurn({
  turn,
  index,
  keep,
  refine,
  manage,
  copy,
  copied,
  updateFormatting,
  choose,
  ...props
}: Props) {
  const details = !!turn.reply || hasResearchCards(turn);
  const localCopy = (value: string, id: string) =>
    copy(value, turn.id + ":" + id);
  return (
    <section
      className="chat-turn"
      aria-label={"Conversation turn " + (index + 1)}
    >
      <p className="chat-author-message">
        <span className="sr-only">You: </span>
        {turn.message}
      </p>
      <div className="chat-reply">
        <div className="chat-byline">
          <Feather size={14} aria-hidden="true" />
          Margin
        </div>
        <ChatActivity activity={turn.activity} />
        {turn.reply && <ReplyMarkdown content={turn.reply} renderScene={source =>
          <SceneReply source={source} copied={copied === turn.id + ":scene:" + source}
            copy={value => localCopy(value, "scene:" + source)} />
        } />}
        {turn.formatting && (
          <ChatFormatting
            proposal={turn.formatting}
            content={props.post.content || ""}
            busy={props.session.busy}
            update={(action) => updateFormatting(turn.id, action)}
            askAgain={() => choose(turn.message)}
          />
        )}
        <ResearchActionCards
          {...props}
          research={turn.research}
          onManage={manage}
        />
        <TurnNotes
          turn={turn}
          details={details}
          busy={props.session.busy}
          keep={keep}
          refine={refine}
          copied={copied}
          copy={localCopy}
        />
      </div>
    </section>
  );
}

function hasResearchCards({ research }: WritingTurn) {
  if (!research) return false;
  return !!(
    research.sources.length ||
    research.saved?.sources ||
    research.saved?.notes
  );
}
function TurnNotes({
  turn,
  details,
  busy,
  keep,
  refine,
  copied,
  copy,
}: Pick<Props, "turn" | "keep" | "refine" | "copied" | "copy"> & {
  details: boolean;
  busy: boolean;
}) {
  if (!turn.plan.sections.length && !turn.plan.questions.length) return null;
  const content = (
    <>
      <WritingResults
        plan={turn.plan}
        keep={(title, body) => keep(turn, title, body)}
        refine={refine}
        busy={busy}
        copied={
          copied.startsWith(turn.id + ":")
            ? copied.slice(turn.id.length + 1)
            : ""
        }
        copy={copy}
      />
      <button
        type="button"
        className="chat-copy"
        onClick={() => copy(copyWritingPlan(turn.plan), "all")}
      >
        <Copy size={13} aria-hidden="true" />
        {copied === turn.id + ":all" ? "Copied" : "Copy all notes"}
      </button>
    </>
  );
  return (
    <div className="chat-turn-notes">
      {details ? (
        <Accordion title="Writing suggestions">{content}</Accordion>
      ) : (
        content
      )}
    </div>
  );
}

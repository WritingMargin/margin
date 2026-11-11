import { ArrowUpRight, Feather } from "lucide-react";

export default function ChatWelcome({
  research,
  choose,
}: {
  research: boolean;
  choose: (text: string) => void;
}) {
  const prompts = research
    ? [
        ["Find a paper", "Find a paper about "],
        ["Explore the evidence", "What evidence would help me evaluate "],
      ]
    : [
        ["Find an angle", "Help me find an angle for an article about "],
        ["Create a 3D animation", "Create a 3D animation showing "],
        ["Shape an outline", "Help me sketch an outline for "],
      ];
  return (
    <section className="chat-welcome">
      <Feather aria-hidden="true" size={23} strokeWidth={1.5} />
      <h3>
        {research ? "What are you researching?" : "What are you working on?"}
      </h3>
      <p>
        {research
          ? "Find a paper, save a source, or talk through the evidence."
          : "Talk through a thought, try an opening, or ask for another read."}
      </p>
      <div className="chat-starters">
        {prompts.map(([label, text]) => (
          <button type="button" key={label} onClick={() => choose(text)}>
            {label}
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

import type { CommentPolicy } from "../../shared/interactions";
export default function CommentRules({ policy }: { policy?: CommentPolicy }) {
  const approval = policy?.requireApproval ?? true;
  return (
    <p className="small-text">
      {approval
        ? "Contributions appear after the author approves them."
        : "Contributions appear automatically."}
      {" Your email stays private."}
    </p>
  );
}

import type { AIPanelController } from "./useAIStudio";
type Props = {
  state: Pick<AIPanelController, "post" | "valid" | "validTitle" | "error">;
};
export default function AIInputStatus({ state }: Props) {
  const { post, valid, validTitle, error } = state;
  return (
    <>
      {" "}
      {!valid && (
        <p className="error-box">
          {post.content?.trim()
            ? "Use an article of 40,000 characters or fewer for generation."
            : "Add some content to your article before generating."}
        </p>
      )}
      {!validTitle && (
        <p className="error-box">
          Give your article a title before generating.
        </p>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </>
  );
}

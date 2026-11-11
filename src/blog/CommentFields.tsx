import { type CommentsDesign } from "../../shared/types";
import "../blog-design.css";
function commentPlaceholder(value: string) {
  return value === "Leave a thoughtful note…" ? "Leave a thoughtful comment…" : value;
}
export function CommentFields({
  design,
  values,
  onChange,
  disabled = false,
  hideEmail = false,
  hideName = false,
}: {
  design: CommentsDesign;
  values: { name: string; email: string; body: string };
  onChange?: (key: "name" | "email" | "body", value: string) => void;
  disabled?: boolean;
  hideEmail?: boolean;
  hideName?: boolean;
}) {
  return (
    <>
      {(!hideName || !hideEmail) && (
        <div
          className={`comment-fields${hideEmail ? " comment-fields-signed-in" : ""}`}
        >
          {!hideName && (
            <label>
              {design.nameLabel}
              <input
                required
                autoComplete="name"
                maxLength={100}
                value={values.name}
                disabled={disabled}
                onChange={(e) => onChange?.("name", e.target.value)}
              />
              {hideEmail && (
                <span className="comment-name-help">
                  Choose once. This name will appear on your comments and questions.
                </span>
              )}
            </label>
          )}
          {!hideEmail && (
            <label>
              {design.emailLabel}
              <span className="muted">never published</span>
              <input
                required
                type="email"
                autoComplete="email"
                value={values.email}
                maxLength={254}
                disabled={disabled}
                onChange={(e) => onChange?.("email", e.target.value)}
              />
            </label>
          )}
        </div>
      )}
      <label>
        {design.bodyLabel}
        <textarea
          required
          rows={4}
          maxLength={10000}
          value={values.body}
          placeholder={commentPlaceholder(design.placeholder)}
          disabled={disabled}
          onChange={(e) => onChange?.("body", e.target.value)}
        />
      </label>
    </>
  );
}

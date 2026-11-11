import type { NewsletterSettingsController } from "./useNewsletterSettings";
type Props = {
  state: Pick<
    NewsletterSettingsController,
    "config" | "dirty" | "message" | "error"
  >;
};
export default function NewsletterFeedback({ state }: Props) {
  const { config, dirty, message, error } = state;
  if (!config) return null;
  return (
    <>
      {" "}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {config.enabled && !config.ready && !dirty && (
        <ul className="newsletter-issues">
          {config.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </>
  );
}

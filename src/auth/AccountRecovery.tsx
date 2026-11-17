export default function AccountRecovery({ feature, rejected, serverToken, refresh, embedded = false }: {
  feature: string;
  rejected: boolean;
  serverToken: boolean;
  refresh: () => void;
  embedded?: boolean;
}) {
  return (
    <section className={embedded ? "account-gate-embedded" : "settings-card"} aria-label={`${feature} account connection`}>
      {!embedded && <h2>{feature}</h2>}
      {rejected ? (
        <>
          <p role="alert">Margin could not verify this publication’s account key.</p>
          {serverToken ? (
            <p>
              To create an account here, remove <code>AI_SERVICE_TOKEN</code> from
              the blog server’s environment and recreate its container using the
              existing data volume. Then check again to see the account creation
              button. If you already have a Margin account, configure its valid
              account key instead.
            </p>
          ) : (
            <p>
              The saved account could not be verified. Ask your publication administrator
              to restore its access or check this blog’s account connection. Keep the existing connection to preserve your account and credits.
            </p>
          )}
        </>
      ) : (
        <p role="alert">Margin could not verify your account right now. Check the connection and try again. Your saved account has been kept.</p>
      )}
      <button type="button" className="button" onClick={refresh}>Check connection again</button>
      <p className="muted">You can continue writing and publishing without connecting an account.</p>
    </section>
  );
}

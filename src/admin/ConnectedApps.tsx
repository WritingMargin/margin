import Accordion from "../Accordion";
import MCPSetup from "./MCPSetup";
import OAuthSettings from "./OAuthSettings";

export default function ConnectedApps({ primaryOwner = false }: { primaryOwner?: boolean }) {
  return <>
    <OAuthSettings primaryOwner={primaryOwner} />
    <section className="settings-card">
      <Accordion title="Connect an AI client"><MCPSetup /></Accordion>
    </section>
  </>;
}

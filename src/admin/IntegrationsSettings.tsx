import { useTeamIdentity } from "../auth/TeamContext";
import { FolderOpen } from "lucide-react";
import { AISettings } from "../AIPanel";
import LinkedInConnection from "../settings/LinkedInConnection";
import StorageSettings from "./StorageSettings";
import OAuthSettings from "./OAuthSettings";
import TokenSettings from "./TokenSettings";

import "./integrations-settings.css";
import { useSettings } from "./useSettings";
export default function IntegrationsSettings(
  props: Parameters<typeof useSettings>[0],
) {
  const state = useSettings(props);
  const { primaryOwner } = useTeamIdentity();
  return (
    <>
      <div className="integrations-settings">
        <LinkedInConnection />
        <AISettings />
        <StorageSettings state={state} />
        {primaryOwner && <TokenSettings state={state} />}
        <OAuthSettings primaryOwner={primaryOwner} />
      </div>
      <p className="settings-note">
        <FolderOpen size={15} />
        See README.md for server configuration, deployment, PostgreSQL, backups,
        and integrations.
      </p>
    </>
  );
}

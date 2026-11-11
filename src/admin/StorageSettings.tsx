import { Cloud } from "lucide-react";
import type { SettingsPanelController } from "./useSettings";
import SettingsDisclosure from "../settings/SettingsDisclosure";
type Props = { state: Pick<SettingsPanelController, "storage"> };
export default function StorageSettings({ state }: Props) {
  const { storage } = state;
  return (
    <SettingsDisclosure
      title="Content storage"
      description="Encrypted content, files, and storage connection details."
      icon={<Cloud />}
      status={
        <span
          className={`connection-status ${storage?.reachable ? "connected" : ""}`}
        >
          <i />
          {connectionLabel(storage)}
        </span>
      }
    >
      <p>
        Margin encrypts the content and files it stores. Saved revisions let you
        revisit earlier versions of your writing.
      </p>
      {storage?.error && <div className="error-box">{storage.error}</div>}
      {storage?.bucket && (
        <div className="config-row">
          <span>Bucket</span>
          <code>{storage.bucket}</code>
        </div>
      )}
      {storage?.encryption && (
        <div className="config-row">
          <span>Encryption</span>
          <code>
            {storage.encryption === "aes-256-gcm-v1"
              ? "AES-256-GCM"
              : "Key required"}
          </code>
        </div>
      )}
      <div className="env-snippet">
        <code>
          S3_BUCKET=your-blog
          <br />
          S3_REGION=us-east-1
          <br />
          S3_ACCESS_KEY_ID=…
          <br />
          S3_SECRET_ACCESS_KEY=…
        </code>
      </div>
      <p className="small-text">
        For MinIO or other compatible providers, also set S3_ENDPOINT and
        S3_FORCE_PATH_STYLE=true.
      </p>
    </SettingsDisclosure>
  );
}

function connectionLabel(storage: SettingsPanelController["storage"]) {
  if (!storage) return "Checking connection…";
  if (storage.reachable) return "Storage connected";
  return storage.configured
    ? "Connection needs attention"
    : "Storage not configured";
}

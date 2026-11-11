import Select from "../components/Select";
import { useState, type ChangeEvent } from "react";
import { Smartphone } from "lucide-react";
import type { Theme } from "../../shared/types";
import { defaultPWASettings } from "../../shared/pwa";
import { api } from "../api";
import { mediaPath, sitePath } from "../base-path";
import type { PublicationSettingsController } from "./usePublicationSettings";
import "./PWASettings.css";
import SettingsDisclosure from "./SettingsDisclosure";

type Props = { state: PublicationSettingsController; theme: Theme };

function PWAIcon({
  state,
  theme,
  uploading,
  setUploading,
}: Props & { uploading: boolean; setUploading: (value: boolean) => void }) {
  const [error, setError] = useState("");
  const icon = state.pwa?.icon || theme.logo;
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > 2 * 1024 * 1024) {
      setError("Choose an image up to 2 MB.");
      return;
    }
    setUploading(true);
    try {
      const result = await api<{ url: string }>("/settings/pwa/icon", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      state.setPWA((current) => current && { ...current, icon: result.url });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="pwa-icon-control">
      <img
        src={icon ? mediaPath(icon) : sitePath("/api/public/brand.svg")}
        alt="App icon source"
      />
      <div>
        <label htmlFor="pwa-icon">App icon override</label>
        <input
          id="pwa-icon"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={uploading}
          onChange={(event) => void upload(event)}
        />
        <p className="small-text">
          {uploading
            ? "Uploading…"
            : "Defaults to your blog logo. Upload a PNG, JPEG, WebP, or GIF up to 2 MB and 16 megapixels, then save."}
        </p>
        {state.pwa?.icon && (
          <button
            className="button"
            type="button"
            disabled={uploading}
            onClick={() =>
              state.setPWA((current) => current && { ...current, icon: "" })
            }
          >
            Use blog logo
          </button>
        )}
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default function PWASettings({ state, theme }: Props) {
  const [uploading, setUploading] = useState(false);
  const settings = state.pwa;
  if (!settings) return null;
  const update = (patch: Partial<typeof settings>) =>
    state.setPWA({ ...settings, ...patch });
  return (
    <div className="publication-settings-grid">
      <form
        className="settings-card"
        onSubmit={(event) => {
          event.preventDefault();
          void state.savePWA();
        }}
      >
        <div className="settings-icon">
          <Smartphone />
        </div>
        <h2>Your blog as an app</h2>
        <p>
          Readers can install your blog with its own name, logo, and colors.
          Leave overrides blank to follow your saved publication design.
        </p>
        <fieldset disabled={state.busy || uploading}>
          <label className="pwa-install-toggle" htmlFor="pwa-show-install">
            <input
              id="pwa-show-install"
              type="checkbox"
              checked={settings.showInstallButton}
              onChange={(event) =>
                update({ showInstallButton: event.target.checked })
              }
            />
            Show “Install app” button on the blog
          </label>
          <p className="small-text">
            Off by default. When enabled, readers can install from the blog
            header or see instructions for their browser.
          </p>
          <label htmlFor="pwa-name">App name</label>
          <input
            id="pwa-name"
            maxLength={120}
            value={settings.name}
            placeholder={theme.name}
            onChange={(event) => update({ name: event.target.value })}
          />
          <label htmlFor="pwa-short-name">Short app name</label>
          <input
            id="pwa-short-name"
            maxLength={30}
            value={settings.shortName}
            placeholder={settings.name || theme.name}
            onChange={(event) => update({ shortName: event.target.value })}
          />
          <PWAIcon
            state={state}
            theme={theme}
            uploading={uploading}
            setUploading={setUploading}
          />
          <div className="pwa-colors">
            <label htmlFor="pwa-theme-color">
              Theme color
              <input
                id="pwa-theme-color"
                value={settings.themeColor}
                placeholder={theme.accent}
                pattern="#[0-9a-fA-F]{6}"
                maxLength={7}
                onChange={(event) => update({ themeColor: event.target.value })}
              />
            </label>
            <label htmlFor="pwa-background-color">
              Background color
              <input
                id="pwa-background-color"
                value={settings.backgroundColor}
                placeholder={theme.background}
                pattern="#[0-9a-fA-F]{6}"
                maxLength={7}
                onChange={(event) =>
                  update({ backgroundColor: event.target.value })
                }
              />
            </label>
          </div>
          <label htmlFor="pwa-start">Open app to</label>
          <Select
            id="pwa-start"
            value={settings.startPage}
            onChange={(event) =>
              update({ startPage: event.target.value as "blog" | "workspace" })
            }
          >
            <option value="blog">Blog homepage</option>
            <option value="workspace">
              Editor workspace (sign-in required)
            </option>
          </Select>
          <div className="settings-actions">
            <button className="button primary" disabled={!state.pwaDirty}>
              {state.busy ? "Saving…" : "Save PWA settings"}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => state.setPWA({ ...defaultPWASettings })}
            >
              Reset to blog branding
            </button>
            {state.pwaDirty && <span className="muted">Unsaved changes</span>}
          </div>
        </fieldset>
      </form>
      <SettingsDisclosure title="Install your blog" description="Installation guidance, saved icon, and app manifest." icon={<Smartphone />}>
        <p>
          Visit your blog over HTTPS and use your browser’s install or Add to
          Home Screen option. Localhost also works for development.
        </p>
        <p>
          The app stays connected to this blog, including when it is hosted
          under a path such as /blog. After signing in and opening the writer
          workspace online once, you can write and save a local draft offline.
          It syncs as a private draft when you reopen the editor with a connection.
        </p>
        <p>
          Saved branding changes apply automatically. Installed devices may take
          time to update their app name and icon.
        </p>
        <p className="small-text">
          Remote image and SVG logos must be directly reachable over public HTTPS.
          If a logo cannot be converted, the app uses a Margin mark in your colors.
          Upload an icon override for consistent results on all devices.
        </p>
        <div className="pwa-saved-icon">
          <img
            src={
              sitePath("/pwa/icon/192.png") +
              "?v=" +
              encodeURIComponent(
                [
                  state.saved?.pwa.icon,
                  state.saved?.pwa.themeColor,
                  state.saved?.pwa.backgroundColor,
                  theme.logo,
                  theme.accent,
                  theme.background,
                ].join("|"),
              )
            }
            alt="Saved installation icon"
          />
          <span>Saved installation icon</span>
        </div>
        <a
          href={sitePath("/manifest.webmanifest")}
          target="_blank"
          rel="noreferrer"
        >
          View saved app manifest
        </a>
      </SettingsDisclosure>
    </div>
  );
}

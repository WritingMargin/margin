import "../blog-design.css";
import { safeLogoUrl } from "../PublicBlog";
import type { DesignerController } from "./useDesigner";
type Props = {
  state: Pick<
    DesignerController,
    | "uploadLogo"
    | "local"
    | "uploadingLogo"
    | "logoSource"
    | "setLogoSource"
    | "update"
  >;
};
export default function LogoControls({ state }: Props) {
  const {
    uploadLogo,
    local,
    uploadingLogo,
    logoSource,
    setLogoSource,
    update,
  } = state;
  return (
    <div className="logo-controls">
      <h4>Blog logo</h4>
      <p className="muted">
        Used in your blog header and browser tab, and in homepage artwork when
        Blog logo is selected. Choose a square image for the clearest tab icon.
        Save your design to publish it.
      </p>
      <div className="logo-source-switch">
        <button
          type="button"
          aria-pressed={logoSource === "upload"}
          disabled={uploadingLogo}
          onClick={() => setLogoSource("upload")}
        >
          Upload
        </button>
        <button
          type="button"
          aria-pressed={logoSource === "url"}
          disabled={uploadingLogo}
          onClick={() => setLogoSource("url")}
        >
          Image URL
        </button>
      </div>
      {logoSource === "url" ? (
        <label>
          Blog logo URL
          <input
            type="url"
            placeholder="https://…"
            maxLength={2048}
            value={local.logo}
            onChange={(e) => update({ logo: e.target.value })}
          />
        </label>
      ) : (
        <label>
          {uploadingLogo ? "Uploading logo…" : "Upload blog logo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={uploadingLogo}
            onChange={uploadLogo}
          />
          <small className="muted">PNG, JPEG, WebP, or GIF · up to 2 MB</small>
        </label>
      )}
      {local.logo && (
        <div className="design-logo-preview">
          {safeLogoUrl(local.logo) ? (
            <img src={safeLogoUrl(local.logo)} alt="Your blog logo" />
          ) : (
            <span>Enter a valid image URL.</span>
          )}
          <button
            className="button"
            disabled={uploadingLogo}
            onClick={() => update({ logo: "" })}
          >
            Remove logo
          </button>
        </div>
      )}
    </div>
  );
}

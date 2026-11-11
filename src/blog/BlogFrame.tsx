import InstallAppButton from "../pwa/InstallAppButton";
import type { PublicPWA } from "../../shared/pwa";
import { publicationCopy } from "../../shared/publication";
import { sitePath } from "../base-path";
import BrandMark from "../BrandMark";
import { Rss } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { applyDocumentTheme } from "./document-theme";
import { sectionColors } from "../../shared/design-presets";
import { typography } from "../../shared/typography";
import { validFooterURL } from "../../shared/footer";
import { type Theme } from "../../shared/types";
import "../blog-design.css";
import "./privacy.css";
import { blogThemeStyle,safeLogoUrl } from "./theme";
export function BlogFrame({
  theme,
  children,
  preview = false,
  pwa,
  section = "homepage",
}: {
  theme: Theme;
  children: ReactNode;
  preview?: boolean;
  pwa?: PublicPWA;
  section?: "homepage" | "article";
}) {
  const words = publicationCopy(theme.publicationType);
  const colors = sectionColors(theme, section);
  useEffect(() => {
    if (!preview) return applyDocumentTheme(colors.background, colors.text);
  }, [preview, colors.background, colors.text]);
  return (
    <div
      className={`public-blog redesigned-blog public-section-${section} ${preview ? "is-design-preview" : ""}`}
      style={blogThemeStyle(theme, section)}
      onClick={
        preview
          ? (e) => {
              if ((e.target as HTMLElement).closest("a")) e.preventDefault();
            }
          : undefined
      }
    >
      <header className="public-nav">
        <a href={sitePath("/")} className="public-brand">
          {safeLogoUrl(theme.logo) ? (
            <img className="blog-logo" src={safeLogoUrl(theme.logo)} alt="" />
          ) : (
            <BrandMark />
          )}
          {theme.name}
        </a>
        <div>
          <ReaderInstallButton pwa={pwa} preview={preview} />
          <a className="journal-link" href={sitePath("/")} >
            {words.navigation}
          </a>
          <a className="rss-link" href={sitePath("/rss.xml")} title="Subscribe via RSS">
            <Rss size={14} />
            <span>RSS</span>
          </a>
        </div>
      </header>
      {children}
      <BlogFooter theme={theme} />
    </div>
  );
}

function BlogFooter({ theme }: { theme: Theme }) {
  const footerFont = theme.footerFont && theme.footerFont !== "inherit" ? typography[theme.footerFont].family : undefined;
  return <footer className="public-footer" data-layout={theme.footerLayout || "split"} style={{ backgroundColor: theme.footerBackground || undefined, color: theme.footerText || undefined, fontFamily: footerFont }}>
    <div className="public-footer-main">
      <div className="public-footer-copy">
        <FooterBrand theme={theme} />
        {theme.footerDescription && <p>{theme.footerDescription}</p>}
      </div>
      <nav className="public-footer-links" aria-label="Footer">
        {(theme.footerLinks || []).filter(link => validFooterURL(link.url)).map((link, index) =>
          <a key={`${index}-${link.url}`} href={link.url.startsWith("/") ? sitePath(link.url) : link.url}>{link.label}</a>)}
        <a href={sitePath("/privacy")}>Privacy</a>
        <a className="rss-link" href={sitePath("/rss.xml")}><Rss size={13} />Follow via RSS</a>
      </nav>
    </div>
    <small className="public-footer-credit">Powered by <a href="https://github.com/WritingMargin/margin">Margin</a></small>
  </footer>;
}

function FooterBrand({ theme }: { theme: Theme }) {
  if (!theme.showFooterLogo && theme.showFooterTitle === false) return null;
  return <div className="public-footer-brand">
    <FooterLogo theme={theme} />
    {theme.showFooterTitle !== false && <strong className="footer-title">{theme.footerTitle || theme.name}</strong>}
  </div>;
}

function FooterLogo({ theme }: { theme: Theme }) {
  if (!theme.showFooterLogo) return null;
  const src = safeLogoUrl(theme.logo);
  if (src) return <img className="footer-logo" src={src} alt={theme.showFooterTitle === false ? theme.name : ""} />;
  return <svg className="footer-logo" viewBox="0 0 32 32" fill="currentColor" role="img" aria-hidden={theme.showFooterTitle !== false} aria-label={theme.showFooterTitle === false ? theme.name : undefined}>
    <path d="M7 3h17a2 2 0 0 1 2 2v12H15a3 3 0 0 0-3 3v9H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M16 20h10L15 29V21a1 1 0 0 1 1-1Z" />
  </svg>;
}

function ReaderInstallButton({ pwa, preview }: { pwa?: PublicPWA; preview: boolean }) {
  if (preview || !pwa?.showInstallButton) return null;
  return <InstallAppButton name={pwa.name} />;
}

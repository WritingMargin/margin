import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { installInstructions, prepareInstallPrompt } from "./install-prompt";
import "./install-app.css";

export default function InstallAppButton({ name }: { name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [instructions, setInstructions] = useState("");
  useEffect(() => {
    const controller = prepareInstallPrompt();
    const display = window.matchMedia(
      "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)",
    );
    const update = () => {
      const standalone = (navigator as Navigator & { standalone?: boolean })
        .standalone;
      const installed =
        controller?.isInstalled() || display.matches || standalone;
      setVisible(window.isSecureContext && !installed);
      if (installed) dialog.current?.close();
    };
    update();
    setInstructions(
      installInstructions(navigator.userAgent, navigator.maxTouchPoints),
    );
    const unsubscribe = controller?.subscribe(update);
    display.addEventListener("change", update);
    return () => {
      unsubscribe?.();
      display.removeEventListener("change", update);
    };
  }, []);

  async function install() {
    setBusy(true);
    const outcome = await prepareInstallPrompt()?.install();
    setBusy(false);
    if (outcome === "unavailable") dialog.current?.showModal();
  }

  if (!visible) return null;
  return (
    <>
      <button
        className="pwa-install-button"
        type="button"
        disabled={busy}
        onClick={() => void install()}
      >
        <Download size={14} aria-hidden="true" />
        Install app
      </button>
      <dialog
        className="pwa-install-dialog"
        ref={dialog}
        aria-labelledby="pwa-install-title"
        aria-describedby="pwa-install-instructions"
      >
        <h2 id="pwa-install-title">Install {name}</h2>
        <p id="pwa-install-instructions">{instructions}</p>
        <p>
          Once installed, open the app from your device. An internet connection
          is required.
        </p>
        <form method="dialog">
          <button type="submit" className="pwa-install-button">
            Close
          </button>
        </form>
      </dialog>
    </>
  );
}

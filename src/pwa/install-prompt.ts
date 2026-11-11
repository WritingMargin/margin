export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Capture once per page, before React renders. Enabled only for publications
// whose owners have opted in, leaving normal browser install UI alone otherwise.
export function createInstallPrompt(target: EventTarget) {
  let pending: InstallPromptEvent | null = null;
  let installed = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const beforeInstall = (event: Event) => {
    event.preventDefault();
    pending = event as InstallPromptEvent;
  };
  const appInstalled = () => {
    pending = null;
    installed = true;
    notify();
  };
  target.addEventListener("beforeinstallprompt", beforeInstall);
  target.addEventListener("appinstalled", appInstalled);
  return {
    isInstalled: () => installed,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async install(): Promise<"accepted" | "dismissed" | "unavailable"> {
      const prompt = pending;
      pending = null; // Browser prompt objects may only be used once.
      if (!prompt) return "unavailable";
      try {
        await prompt.prompt(); // Must happen synchronously within the reader's click.
        const choice = await prompt.userChoice;
        if (choice.outcome === "accepted") appInstalled();
        return choice.outcome;
      } catch {
        return "unavailable";
      }
    },
    dispose() {
      target.removeEventListener("beforeinstallprompt", beforeInstall);
      target.removeEventListener("appinstalled", appInstalled);
      listeners.clear();
      pending = null;
    },
  };
}

let controller: ReturnType<typeof createInstallPrompt> | undefined;
export function prepareInstallPrompt() {
  if (typeof window === "undefined") return undefined;
  controller ??= createInstallPrompt(window);
  return controller;
}

export function installInstructions(userAgent: string, touchPoints: number) {
  if (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && touchPoints > 1)
  ) {
    return "Open this blog in Safari, tap Share, then choose Add to Home Screen. Enable Open as Web App if offered, then tap Add.";
  }
  if (
    /Macintosh/.test(userAgent) &&
    /Safari/.test(userAgent) &&
    !/Chrome|Chromium|Edg|OPR/.test(userAgent)
  ) {
    return "In Safari, choose File → Add to Dock, confirm the app name, and choose Add.";
  }
  return "Open your browser’s menu and look for Install app or Add to Home Screen. You may also find an install icon in the address bar. If no option appears, this browser may not support installation, or the app may already be installed.";
}

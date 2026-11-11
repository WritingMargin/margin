import type { CaptchaProvider } from "../../shared/captcha";

type CaptchaAPI = {
  render: (
    container: HTMLElement,
    options: Record<string, unknown>,
  ) => string | number;
  reset: (id: string | number) => void;
  remove?: (id: string | number) => void;
};
export type CaptchaWidget = { reset: () => void; remove: () => void };
const pending = new Map<CaptchaProvider, Promise<CaptchaAPI>>();

function apiFor(provider: CaptchaProvider): CaptchaAPI | undefined {
  const globals = window as unknown as {
    turnstile?: CaptchaAPI;
    grecaptcha?: CaptchaAPI;
  };
  return provider === "turnstile" ? globals.turnstile : globals.grecaptcha;
}

export function loadCaptcha(provider: CaptchaProvider): Promise<CaptchaAPI> {
  const api = apiFor(provider);
  if (typeof api?.render === "function") return Promise.resolve(api);
  const existing = pending.get(provider);
  if (existing) return existing;
  const loading = loadScript(provider);
  pending.set(provider, loading);
  void loading.catch(() => pending.delete(provider));
  return loading;
}

function loadScript(provider: CaptchaProvider): Promise<CaptchaAPI> {
  return new Promise((resolve, reject) => {
    const callback =
      provider === "turnstile"
        ? "marginTurnstileReady"
        : "marginRecaptchaReady";
    const globals = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    const finish = (api?: CaptchaAPI) => {
      window.clearTimeout(timeout);
      script.onerror = null;
      if (api) resolve(api);
      else {
        script.remove();
        reject(new Error("Bot verification could not load."));
      }
    };
    const timeout = window.setTimeout(() => finish(), 15000);
    globals[callback] = () => finish(apiFor(provider));
    const base =
      provider === "turnstile"
        ? "https://challenges.cloudflare.com/turnstile/v0/api.js"
        : "https://www.google.com/recaptcha/api.js";
    script.src = `${base}?render=explicit&onload=${callback}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => finish();
    document.head.appendChild(script);
  });
}

export function renderCaptcha(
  api: CaptchaAPI,
  provider: CaptchaProvider,
  container: HTMLElement,
  options: {
    siteKey: string;
    action: string;
    cData: string;
    token: (token: string) => void;
    failed: () => void;
  },
): CaptchaWidget {
  // A fresh child permits reCAPTCHA remounts without React owning provider DOM.
  const child = document.createElement("div");
  container.appendChild(child);
  const settings: Record<string, unknown> = {
    sitekey: options.siteKey,
    theme: "light",
    size: container.clientWidth >= 304 ? "normal" : "compact",
    callback: options.token,
    "expired-callback": () => options.token(""),
    "error-callback": () => {
      options.failed();
      return true;
    },
  };
  if (provider === "turnstile") {
    settings.size = container.clientWidth >= 300 ? "flexible" : "compact";
    settings.appearance = "interaction-only";
    if (options.action) settings.action = options.action;
    if (options.cData) settings.cData = options.cData;
  }
  let id: string | number;
  try {
    id = api.render(child, settings);
  } catch (error) {
    child.remove();
    throw error;
  }
  return {
    reset: () => api.reset(id),
    remove: () => {
      if (api.remove) api.remove(id);
      else api.reset(id);
      child.remove();
    },
  };
}

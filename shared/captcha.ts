export type CaptchaProvider = "turnstile" | "recaptcha-v2";
export type CaptchaMode = "managed" | CaptchaProvider;
export type CaptchaTheme = {
  captchaProvider?: CaptchaProvider | "";
  captchaAction?: string;
  captchaCData?: string;
};

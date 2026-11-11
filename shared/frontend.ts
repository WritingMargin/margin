import type { Theme } from "./types";
import type { SEOSettings } from "./seo";
export type PublicTheme = Theme &
  import("./captcha").CaptchaTheme & {
    authorProfile?: import("./author-profile").AuthorProfile;
    pwa?: import("./pwa").PublicPWA;
    captchaSiteKey?: string;
    commentPolicy?: import("./interactions").CommentPolicy;
    seo: SEOSettings;
    publicUrl: string;
  };

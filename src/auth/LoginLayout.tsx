import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import BrandMark from "../BrandMark";
import { sitePath } from "../base-path";

export default function LoginLayout({
  children,
  cloudManaged,
}: {
  children: ReactNode;
  cloudManaged?: boolean;
}) {
  return (
    <main className="login-page">
      <a className="brand" href={sitePath("/")}>
        <BrandMark />
        margin<span className="brand-period">®</span>
      </a>
      <div className="login-layout">
        <div className="login-intro">
          <span className="eyebrow">A LITTLE SPACE. A LOT OF POSSIBILITY.</span>
          <h1>
            Good ideas
            <br />
            need a margin.
          </h1>
          <p>
            Your words, your corner of the internet.
            <br />A considered space to write and publish.
          </p>
          <div className="login-art">
            <span>think.</span>
            <span>write.</span>
            <span>
              make it yours.
              <ArrowUpRight size={36} />
            </span>
          </div>
        </div>
        {children}
      </div>
      <footer>
        MADE FOR WORDS THAT MATTER.
        <span>
          {cloudManaged
            ? "Cloud hosted. Independently yours."
            : "Self-hosted. Independently yours."}
        </span>
      </footer>
    </main>
  );
}

import { useRef, useState } from "react";
import type { Post } from "../../shared/types";
import { api, json } from "../api";

type Intent = "configured" | "index" | "hidden";
type Mode = "draft" | "public";
type Finding = {
  code: string;
  severity: "error" | "warning" | "suggestion" | "unavailable";
  field: string;
  message: string;
  why: string;
  fix: string;
  passage?: string;
};
type Report = { mode: Mode; intent: string; url?: string; findings: Finding[] };

export function useArticleAudit() {
  const [intent, setIntent] = useState<Intent>("configured");
  const [last, setLast] = useState<{ id: string; report: Report }>();
  const [pending, setPending] = useState(false);
  const request = useRef(0);

  async function run(post: Post, mode: Mode) {
    const current = ++request.current;
    const { title, slug, content, cover, excerpt, seo } = post;
    const input =
      mode === "public"
        ? { id: post.id }
        : { article: { title, slug, content, cover, excerpt, seo } };
    setPending(true);
    let report: Report;
    try {
      report = await api<Report>(
        "/posts/audit",
        json("POST", {
          mode,
          intent: intent === "configured" ? undefined : intent,
          ...input,
        }),
      );
    } catch {
      report = {
        mode,
        intent,
        findings: [
          {
            code: "audit.unavailable",
            severity: "unavailable",
            field: "Audit service",
            message: "Margin could not complete this check.",
            why: "The current article has not been verified.",
            fix: "Check your connection and run the audit again.",
          },
        ],
      };
    }
    if (request.current === current) {
      setLast({ id: post.id, report });
      setPending(false);
    }
    return report;
  }
  async function beforeSave(post: Post, publish: boolean) {
    if (!publish) return;
    const report = await run(post, "draft");
    const blocking = report.findings.find(
      (finding) => finding.severity === "error",
    );
    if (blocking) throw new Error(blocking.message + " " + blocking.fix);
  }
  function afterSave(post: Post) {
    if (post.status === "published") void run(post, "public");
  }
  return { intent, setIntent, last, pending, run, beforeSave, afterSave };
}

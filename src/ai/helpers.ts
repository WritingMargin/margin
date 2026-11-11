import { type SocialPlatform } from "../../shared/ai";
import "../ai.css";
import { api, json } from "../api";
import { requestIdentity, settleRequestIdentity } from "./request-identity";
export const platformNotes: Record<SocialPlatform, string> = {
  linkedin: "Insightful & professional",
  x: "Short & to the point",
  instagram: "Visual story & discovery",
  facebook: "Warm & conversational",
  threads: "A thought that starts a conversation",
  devto: "Article summary + link",
  substack: "Article summary + link",
  medium: "Article summary + link",
};
export function stamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export async function generationRequest(
  path: string,
  body: unknown,
  scope = "",
) {
  const identity = await requestIdentity(path, body, scope);
  try {
    const result = await api(path, {
      ...json("POST", body),
      headers: { "Idempotency-Key": identity.id },
    });
    settleRequestIdentity(identity, true);
    return result;
  } catch (error) {
    settleRequestIdentity(identity, false, error);
    throw error;
  }
}

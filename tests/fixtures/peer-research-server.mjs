import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

export const legacyBrief = "How should I investigate this unsaved draft?";
export const legacyQuestion = "What does `sample_size` tell us?";
export const saveResearchBrief =
  "Find relevant publications, then save the secondary field report and a private thinking note to this draft.";
export const savedAgentSource = {
  url: "https://doi.org/10.1000/secondary-report",
  title: "Secondary field report",
  excerpt: "Researchers assessed day-to-day measurement differences.",
};
export const savedAgentNote = {
  title: "Measurement follow-up",
  body: "Compare the day-to-day difference with the measurement uncertainty.",
};
const ordinaryReply =
  "Start by comparing the sample size with the uncertainty.";
const richReply = [
  ordinaryReply,
  "",
  "### Reading the results",
  "",
  "- Inspect the sampling design.",
  "  - Check the observation count.",
  "",
  "- [x] Verify the protocol.",
  "",
  "| Metric | Observations | Baseline estimate | Follow-up estimate | Standard deviation | Sampling uncertainty | Comparison method |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  "| Sample | 24 | 20 | 23 | 2 | 0.4 | Paired |",
  "",
  "[Read the field report][study] for the `sample_size`.",
  "",
  "[study]: " + savedAgentSource.url,
  "",
  "```python",
  "print(observation_count)",
  "# " + "include the sample uncertainty ".repeat(9),
  "```",
  "",
  "![Sampling figure](https://fixture.invalid/tracking.png)",
  "",
  "<img src='https://fixture.invalid/raw.png' />",
].join("\n");
const assistantSources = [
  {
    url: "https://doi.org/10.1000/review-fixture",
    title: "Fixture field study",
    excerpt:
      "Sample variance was recorded. Researchers repeated measurements on two days to compare variation within observations and across the sample. The report describes the collection schedule, uncertainty estimates, and limitations of the study design.",
  },
  {
    url: "https://doi.org/10.1000/comparison",
    title: "Independent comparison",
    excerpt: "Independent measurements are reported.",
  },
];
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return "http://127.0.0.1:" + server.address().port;
}

async function collect(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function objectStore() {
  const objects = new Map();
  return createServer(async (req, res) => {
    const key = new URL(req.url, "http://storage.test").pathname;
    if (req.method === "HEAD") return res.end();
    if (req.method === "PUT") {
      objects.set(key, await collect(req));
      return res.end();
    }
    if (req.method === "DELETE") {
      objects.delete(key);
      return res.writeHead(204).end();
    }
    if (!objects.has(key)) return res.writeHead(404).end();
    return res.end(objects.get(key));
  });
}

export async function startPeerReviewFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "margin-peer-browser-"));
  const s3 = objectStore();
  const mailbox = [];
  const researchInputs = [];
  const central = createServer(async (req, res) => {
    const bytes = await collect(req);
    const body = bytes.length ? JSON.parse(bytes) : {};
    let result;
    switch (req.url) {
      case "/v1/newsletter/peer-review":
        mailbox.push(body);
        result = { accepted: true };
        break;
      case "/v1/reader-auth/providers":
        result = { providers: ["google"] };
        break;
      case "/v1/reader-auth/start":
        assert.equal(body.provider, "google");
        result = {
          url:
            "https://accounts.google.com/fixture?state=" +
            encodeURIComponent(body.state),
        };
        break;
      case "/v1/reader-auth/exchange": {
        const wrong = body.code === "wrong";
        result = {
          provider: "google",
          name: wrong ? "Other reviewer" : "Dr. Rivera",
          email: wrong ? "another@example.test" : "peer@example.test",
          identity: createHash("sha256").update(body.code).digest("hex"),
        };
        break;
      }
      case "/v1/generations/writing":
        if (body.schemaName === "content_formatting") {
          const [{ line }] = body.input.candidates;
          result = { plan: { changes: [{ line, style: "bold" }] } };
          break;
        }
        researchInputs.push(body.input);
        if (body.input.brief === "Format this draft with clear emphasis.") {
          const candidate =
            body.input.formattingCandidates.find((item) =>
              item.text.includes("Field measurements"),
            ) || body.input.formattingCandidates[0];
          result = {
            plan: {
              reply: "Here is a formatting suggestion for your existing words.",
              sections: [],
              questions: [],
              formatting: {
                changes: [{ line: candidate.line, style: "bold" }],
              },
            },
          };
          break;
        }
        if (
          body.input.brief === "Review this draft while I start another chat."
        )
          await new Promise((resolve) => setTimeout(resolve, 3000));
        if (body.input.brief === legacyBrief) {
          result = {
            plan: {
              sections: [
                {
                  heading: "Compare evidence",
                  notes: [
                    "Review **sampling** with the [methods appendix](https://example.test/methods).",
                  ],
                },
              ],
              questions: [legacyQuestion],
            },
          };
          break;
        }
        result = {
          plan: {
            ...(body.input.conversationMode
              ? {
                  reply:
                    body.input.brief === saveResearchBrief
                      ? richReply
                      : ordinaryReply,
                }
              : {}),
            sections: [
              {
                heading: "Compare evidence",
                notes: ["Check uncertainty against the reported sample."],
              },
            ],
            questions: ["How large was the study?"],
          },
          ...(body.input.researchMode
            ? {
                researchSources:
                  body.input.brief === saveResearchBrief
                    ? [savedAgentSource]
                    : assistantSources,
              }
            : {}),
          ...(body.input.researchMode &&
          body.input.canSaveResearch &&
          body.input.brief === saveResearchBrief
            ? {
                researchActions: [
                  { kind: "save_source", url: savedAgentSource.url },
                  { kind: "save_thinking_note", ...savedAgentNote },
                ],
              }
            : {}),
        };
        break;
      default:
        result = {
          configured: true,
          credits: 100,
          costs: { writing: 1 },
          features: { writing: true },
          entitlements: {
            active: true,
            planId: "studio",
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        };
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
  });
  const centralURL = await listen(central);
  const storageURL = await listen(s3);
  const reserve = createServer();
  const base = await listen(reserve);
  await new Promise((resolve) => reserve.close(resolve));
  const binary = path.resolve(
    process.env.MARGIN_BROWSER_SERVER || "artifacts/margin-server",
  );
  const web = path.resolve(process.env.MARGIN_BROWSER_WEB || "dist/client");
  const env = {
    PATH: process.env.PATH,
    MARGIN_ENV: "test",
    PUBLIC_URL: base,
    SQLITE_PATH: path.join(dir, "margin.db"),
    SETUP_TOKEN: "local-review-fixture",
    AI_SERVICE_URL: centralURL,
    AI_SERVICE_TOKEN: "fixture",
    CONTENT_ENCRYPTION_KEY: "ab".repeat(32),
    S3_BUCKET: "review-fixture",
    S3_REGION: "us-east-1",
    S3_ENDPOINT: storageURL,
    S3_FORCE_PATH_STYLE: "true",
    S3_ACCESS_KEY_ID: "fixture",
    S3_SECRET_ACCESS_KEY: "fixture",
  };
  const child = spawn(
    binary,
    [
      "serve",
      "--host",
      "127.0.0.1",
      "--port",
      new URL(base).port,
      "--web-dir",
      web,
    ],
    { env, cwd: dir },
  );
  let output = "";
  child.stderr.on("data", (b) => {
    output += b;
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Server startup timeout: " + output)),
        30000,
      );
      child.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error("Server exited " + code + ": " + output));
      });
      child.stdout.on("data", (b) => {
        if (String(b).includes("Margin listening")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  } catch (e) {
    child.kill();
    central.close();
    s3.close();
    throw e;
  }
  return {
    base,
    dir,
    mailbox,
    researchInputs,
    async close() {
      if (child.exitCode === null) {
        const done = once(child, "exit");
        child.kill("SIGTERM");
        await done;
      }
      central.closeAllConnections();
      s3.closeAllConnections();
      await Promise.all(
        [central, s3].map(
          (server) => new Promise((resolve) => server.close(resolve)),
        ),
      );
    },
  };
}

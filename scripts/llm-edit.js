// scripts/llm-edit.js

const { Octokit } = require("@octokit/rest");
const OpenAI = require("openai");
const { Base64 } = require("js-base64");

// ENV variables from GitHub Actions
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const COMMENT_BODY = process.env.COMMENT_BODY || "";
const COMMENT_AUTHOR = process.env.COMMENT_AUTHOR || "";
const REPO = process.env.REPO;
const ALLOWED_USERS = (process.env.ALLOWED_USERS || "")
  .split(",")
  .map((x) => x.trim())
  .filter((x) => x.length > 0);

// Branch to auto-push edits to
const TARGET_BRANCH = process.env.AUTO_PUSH_BRANCH || "staging";

if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

if (!GITHUB_TOKEN) {
  console.error("❌ Missing GITHUB_TOKEN");
  process.exit(1);
}

if (!REPO) {
  console.error("❌ Missing REPO environment variable.");
  process.exit(1);
}

const [owner, repo] = REPO.split("/");

// Restrict who can trigger edits
if (ALLOWED_USERS.length && !ALLOWED_USERS.includes(COMMENT_AUTHOR)) {
  console.log("⛔ User not allowed to trigger edits:", COMMENT_AUTHOR);
  process.exit(0);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Parse comment format
//
// /edit
// file: public/app.js
// instruction: change button color
//
function parseEdit(comment) {
  const lines = comment.split("\n").map((l) => l.trim());

  if (!lines[0] || !lines[0].toLowerCase().startsWith("/edit")) return null;

  const fileLine = lines.find((l) => l.toLowerCase().startsWith("file:"));
  const instrIndex = lines.findIndex((l) =>
    l.toLowerCase().startsWith("instruction:")
  );

  if (!fileLine || instrIndex === -1) return null;

  const filePath = fileLine.split(":").slice(1).join(":").trim();
  const instruction = lines
    .slice(instrIndex)
    .join("\n")
    .replace(/^instruction:\s*/i, "")
    .trim();

  if (!filePath || !instruction) return null;

  return { filePath, instruction };
}

(async () => {
  const parsed = parseEdit(COMMENT_BODY);

  if (!parsed) {
    console.log("Comment does not match /edit format. Ignoring.");
    return;
  }

  const { filePath, instruction } = parsed;

  console.log("✏ Editing file:", filePath);
  console.log("📘 Instruction:", instruction);

  // -----------------------------
  // 1. LOAD EXISTING FILE CONTENT
  // -----------------------------
  let original;
  try {
    const res = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: "main",
    });

    original = Base64.decode(res.data.content);
  } catch (e) {
    console.error("❌ Failed to read file:", filePath);
    process.exit(1);
  }

  // -----------------------------
  // 2. SEND TO OPENAI FOR EDITING
  // -----------------------------
  console.log("🤖 Sending request to OpenAI...");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert code editor. Return ONLY the FULL updated file content. No explanations.",
      },
      {
        role: "user",
        content: `Edit this file according to the instructions.

FILE PATH: ${filePath}

INSTRUCTION:
${instruction}

ORIGINAL FILE:
<<<FILE_START
${original}
FILE_END>>>

Return ONLY the updated file.`,
      },
    ],
    temperature: 0,
  });

  const newContent = completion.choices[0].message.content.trim();

  if (!newContent) {
    console.error("❌ LLM returned empty content.");
    process.exit(1);
  }

  console.log("✅ Received updated file content.");

  // -----------------------------
  // 3. CREATE OR UPDATE STAGING BRANCH
  // -----------------------------
  let baseSha;

  try {
    // Try to get staging branch
    const ref = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${TARGET_BRANCH}`,
    });

    baseSha = ref.data.object.sha;
    console.log("📌 Staging branch exists.");
  } catch {
    console.log("➕ Staging branch does not exist. Creating it...");

    // Get main branch SHA
    const mainRef = await octokit.git.getRef({
      owner,
      repo,
      ref: "heads/main",
    });

    baseSha = mainRef.data.object.sha;

    // Create new staging branch
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${TARGET_BRANCH}`,
      sha: baseSha,
    });

    console.log("🎉 Staging branch created.");
  }

  // -----------------------------
  // 4. WRITE UPDATED FILE TO STAGING
  // -----------------------------
  console.log("💾 Writing updated file to staging branch...");

  const encoded = Base64.encode(newContent);

  // Check if file exists on staging
  let existingSha = null;
  try {
    const r = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: TARGET_BRANCH,
    });
    existingSha = r.data.sha;
  } catch {}

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: `LLM edit: ${filePath}`,
    content: encoded,
    branch: TARGET_BRANCH,
    sha: existingSha || undefined,
  });

  console.log("🚀 File updated on staging branch:", TARGET_BRANCH);
})();

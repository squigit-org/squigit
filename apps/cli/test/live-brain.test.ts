import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeImage, promptChat, getActiveProfileId, getStoreBaseDir } from "../src/harness.js";

const liveStoreEnabled = process.env.SQUIGIT_LIVE_STORE_TESTS === "1";
const liveTest = liveStoreEnabled ? test : test.skip;

let latestChatId: string | null = null;

async function createFixtureImage(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "squigit-cli-"));
  const imagePath = path.join(dir, "fixture.png");

  // 1x1 transparent PNG
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3Z4J0AAAAASUVORK5CYII=";
  await fs.writeFile(imagePath, Buffer.from(pngBase64, "base64"));

  return imagePath;
}

async function resolveAnalyzeImagePath(): Promise<string> {
  const overridePath = process.env.SQUIGIT_BRAIN_ANALYZE_IMAGE_PATH?.trim();
  if (!overridePath) {
    return createFixtureImage();
  }

  const resolvedPath = path.resolve(overridePath);
  await fs.access(resolvedPath);
  return resolvedPath;
}

liveTest("analyze command creates a chat in the active profile store", async () => {
  const profileId = getActiveProfileId()?.trim();
  assert.ok(profileId, "No active profile found. Sign in first.");

  const imagePath = await resolveAnalyzeImagePath();
  let assistantMessage = "";
  const payload = await analyzeImage(imagePath, "models/gemini-flash-latest", undefined, (err: any, event: any) => {
    if (event && event.eventType === "token" && event.token) {
        assistantMessage += event.token;
    }
  });

  assert.ok(payload.chatId);
  assert.ok(assistantMessage.trim().length > 0);
  assert.notEqual(payload.title.trim().toLowerCase(), "untitled");
  latestChatId = payload.chatId;

  const baseDir = (await getStoreBaseDir()).trim();
  const chatDir = path.join(baseDir, profileId, "chats", payload.chatId);

  await fs.access(path.join(chatDir, "messages.json"));
  await fs.access(path.join(chatDir, "messages.md"));
});

liveTest("prompt command appends to same chat and normalizes @/absolute/path", async () => {
  const profileId = getActiveProfileId()?.trim();
  assert.ok(profileId, "No active profile found. Sign in first.");

  if (!latestChatId) {
    const imagePath = await resolveAnalyzeImagePath();
    const payload = await analyzeImage(imagePath, "models/gemini-flash-latest", undefined, () => {});
    latestChatId = payload.chatId;
  }

  assert.ok(latestChatId);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "squigit-file-"));
  const attachmentPath = path.resolve(tmpDir, "note.txt");
  await fs.writeFile(attachmentPath, "hello from cli attachment\n");

  const promptText = `please inspect @${attachmentPath}`;
  let assistantMessage = "";
  const payload = await promptChat(latestChatId, "models/gemini-flash-latest", promptText, (err: any, event: any) => {
    if (event && event.eventType === "token" && event.token) {
        assistantMessage += event.token;
    }
  });

  assert.equal(payload.chatId, latestChatId);
  assert.ok(assistantMessage.trim().length > 0);

  const baseDir = (await getStoreBaseDir()).trim();
  const chatDir = path.join(baseDir, profileId, "chats", latestChatId);
  const messagesJson = await fs.readFile(path.join(chatDir, "messages.json"), "utf8");
  const messagesMd = await fs.readFile(path.join(chatDir, "messages.md"), "utf8");

  assert.match(messagesJson, /"role"\s*:\s*"user"/);
  assert.match(messagesJson, /\[note\.txt\]\(<.*objects\//);
  assert.match(messagesMd, /note\.txt/);
});

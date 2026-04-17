import { parseLastJsonLine, runBrainHarness } from "../harness.js";

type BrainAction = "analyze" | "prompt";

type AnalyzePayload = {
  chat_id: string;
  title: string;
  assistant_message: string;
  image_path: string;
};

type PromptPayload = {
  chat_id: string;
  assistant_message: string;
};

const PREVIEW_TOKEN_LIMIT = 96;

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/index.js brain analyze <image_path> [user_message...]",
    "  node dist/src/index.js brain prompt <chat_id> <message...>",
  ].join("\n");
}

function parseAction(rawAction: string | undefined): BrainAction {
  if (rawAction === "analyze" || rawAction === "prompt") {
    return rawAction;
  }

  throw new Error(`Unknown brain action '${rawAction ?? ""}'.\n\n${usage()}`);
}

function sanitizePreview(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function tokenPreview(text: string, maxTokens: number): {
  preview: string;
  shownTokens: number;
  totalTokens: number;
  truncated: boolean;
} {
  const cleaned = sanitizePreview(text);
  if (!cleaned) {
    return { preview: "", shownTokens: 0, totalTokens: 0, truncated: false };
  }

  const tokens = cleaned.split(" ");
  const shownTokens = Math.min(tokens.length, maxTokens);
  const truncated = tokens.length > maxTokens;
  const preview = tokens.slice(0, shownTokens).join(" ");

  return {
    preview: truncated ? `${preview} ...` : preview,
    shownTokens,
    totalTokens: tokens.length,
    truncated,
  };
}

function printResponsePreview(response: string): void {
  const preview = tokenPreview(response, PREVIEW_TOKEN_LIMIT);
  const suffix = preview.truncated ? " (truncated)" : "";
  console.log(
    `model response [${preview.shownTokens}/${preview.totalTokens} tokens${suffix}]:`,
  );
  console.log(preview.preview || "(empty)");
}

async function withSpinner<T>(label: string, task: () => Promise<T>): Promise<T> {
  if (!process.stderr.isTTY) {
    console.error(`[brain] ${label}...`);
    return task();
  }

  const frames = ["|", "/", "-", "\\"];
  let frameIndex = 0;
  const prefix = `[brain] ${label} `;
  const render = (): void => {
    process.stderr.write(`\r${prefix}${frames[frameIndex]}`);
  };

  render();
  const timer = setInterval(() => {
    frameIndex = (frameIndex + 1) % frames.length;
    render();
  }, 100);

  try {
    const result = await task();
    clearInterval(timer);
    process.stderr.write(`\r${prefix}done.\n`);
    return result;
  } catch (error) {
    clearInterval(timer);
    process.stderr.write(`\r${prefix}failed.\n`);
    throw error;
  }
}

async function runAnalyze(args: string[]): Promise<void> {
  if (args.length < 1) {
    throw new Error("Action 'analyze' requires `<image_path>`.");
  }

  const imagePath = args[0].trim();
  if (!imagePath) {
    throw new Error("Action 'analyze' requires a non-empty `<image_path>`.");
  }

  const userMessage = args.slice(1).join(" ").trim();
  const harnessArgs = ["analyze", imagePath];
  if (userMessage) {
    harnessArgs.push(userMessage);
  }

  const stdout = await withSpinner("handshaking with Gemini", () =>
    runBrainHarness(harnessArgs),
  );
  const payload = parseLastJsonLine<AnalyzePayload>(stdout);

  console.log(`chat title: ${payload.title}`);
  console.log(`chat id: ${payload.chat_id}`);
  printResponsePreview(payload.assistant_message);
}

async function runPrompt(args: string[]): Promise<void> {
  if (args.length < 2) {
    throw new Error("Action 'prompt' requires `<chat_id> <message...>`.");
  }

  const chatId = args[0].trim();
  if (!chatId) {
    throw new Error("Action 'prompt' requires a non-empty `<chat_id>`.");
  }

  const message = args.slice(1).join(" ").trim();
  if (!message) {
    throw new Error("Action 'prompt' requires a non-empty message.");
  }

  const stdout = await withSpinner("handshaking with Gemini", () =>
    runBrainHarness(["prompt", chatId, message]),
  );
  const payload = parseLastJsonLine<PromptPayload>(stdout);

  console.log(`chat id: ${payload.chat_id}`);
  printResponsePreview(payload.assistant_message);
}

export async function runBrainCommand(args: string[]): Promise<void> {
  const action = parseAction(args[0]);
  const rest = args.slice(1);

  switch (action) {
    case "analyze":
      await runAnalyze(rest);
      return;
    case "prompt":
      await runPrompt(rest);
      return;
    default:
      throw new Error(usage());
  }
}

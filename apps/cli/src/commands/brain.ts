import {
  analyzeImage,
  promptThread,
  listThreads,
  getActiveProfileId,
  listProfiles,
} from "../harness.js";

type BrainAction = "analyze" | "prompt" | "threads";

const LIST_SEPARATOR =
  "------------------------------------------------------------";

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/index.js brain analyze <image_path> [user_message...]",
    "  node dist/src/index.js brain prompt <thread_id> <message...>",
    "  node dist/src/index.js brain threads",
  ].join("\n");
}

function parseAction(rawAction: string | undefined): BrainAction {
  if (
    rawAction === "analyze" ||
    rawAction === "prompt" ||
    rawAction === "threads"
  ) {
    return rawAction;
  }

  throw new Error(`Unknown brain action '${rawAction ?? ""}'.\n\n${usage()}`);
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

  let firstTokenReceived = false;

  console.log(`[brain] handshaking with Gemini...`);

  const payload = await analyzeImage(
    imagePath,
    "models/gemini-flash-latest",
    userMessage || undefined,
    (err, event) => {
      if (err) return;
      if (event.eventType === "token" && event.token) {
        if (!firstTokenReceived) {
          console.log();
          firstTokenReceived = true;
        }
        process.stdout.write(event.token);
      }
      if (event.eventType === "tool_start") {
        console.log(`\n🔧 ${event.name}: ${event.message}`);
      }
    },
  );

  console.log("\n");
  console.log(`thread title: ${payload.title}`);
  console.log(`thread id: ${payload.threadId}`);
}

async function runPrompt(args: string[]): Promise<void> {
  if (args.length < 2) {
    throw new Error("Action 'prompt' requires `<thread_id> <message...>`.");
  }

  const threadId = args[0].trim();
  if (!threadId) {
    throw new Error("Action 'prompt' requires a non-empty `<thread_id>`.");
  }

  const message = args.slice(1).join(" ").trim();
  if (!message) {
    throw new Error("Action 'prompt' requires a non-empty message.");
  }

  let firstTokenReceived = false;

  console.log(`[brain] handshaking with Gemini...`);

  const payload = await promptThread(
    threadId,
    "models/gemini-flash-latest",
    message,
    (err, event) => {
      if (err) return;
      if (event.eventType === "token" && event.token) {
        if (!firstTokenReceived) {
          console.log();
          firstTokenReceived = true;
        }
        process.stdout.write(event.token);
      }
      if (event.eventType === "tool_start") {
        console.log(`\n🔧 ${event.name}: ${event.message}`);
      }
    },
  );

  console.log("\n");
  console.log(`thread id: ${payload.threadId}`);
}

async function runThreads(args: string[]): Promise<void> {
  if (args.length > 0) {
    throw new Error("Action 'threads' does not accept arguments.");
  }

  const threads = listThreads();
  const activeProfileId = getActiveProfileId()?.trim();
  const profiles = listProfiles();

  const activeEmail = profiles.find(
    (profile) => profile.id === activeProfileId,
  )?.email;
  if (!activeEmail) {
    throw new Error("No active profile found. Run auth login first.");
  }

  console.log(LIST_SEPARATOR);
  console.log(`listed threads for ${activeEmail}`);

  if (threads.length === 0) {
    console.log("(no threads)");
    console.log(LIST_SEPARATOR);
    return;
  }

  for (const thread of threads) {
    console.log(`${thread.id} | ${thread.title}`);
  }
  console.log(LIST_SEPARATOR);
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
    case "threads":
      await runThreads(rest);
      return;
    default:
      throw new Error(usage());
  }
}

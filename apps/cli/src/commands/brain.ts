import {
  analyzeImage,
  promptChat,
  listChats,
  getActiveProfileId,
  listProfiles,
} from "../harness.js";

type BrainAction = "analyze" | "prompt" | "chats";

const LIST_SEPARATOR = "------------------------------------------------------------";

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/index.js brain analyze <image_path> [user_message...]",
    "  node dist/src/index.js brain prompt <chat_id> <message...>",
    "  node dist/src/index.js brain chats",
  ].join("\n");
}

function parseAction(rawAction: string | undefined): BrainAction {
  if (rawAction === "analyze" || rawAction === "prompt" || rawAction === "chats") {
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
    }
  );

  console.log("\n");
  console.log(`chat title: ${payload.title}`);
  console.log(`chat id: ${payload.chatId}`);
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

  let firstTokenReceived = false;
  
  console.log(`[brain] handshaking with Gemini...`);

  const payload = await promptChat(
    chatId,
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
    }
  );

  console.log("\n");
  console.log(`chat id: ${payload.chatId}`);
}

async function runChats(args: string[]): Promise<void> {
  if (args.length > 0) {
    throw new Error("Action 'chats' does not accept arguments.");
  }

  const chats = listChats();
  const activeProfileId = getActiveProfileId()?.trim();
  const profiles = listProfiles();

  const activeEmail = profiles.find((profile) => profile.id === activeProfileId)?.email;
  if (!activeEmail) {
    throw new Error("No active profile found. Run auth login first.");
  }

  console.log(LIST_SEPARATOR);
  console.log(`listed chats for ${activeEmail}`);

  if (chats.length === 0) {
    console.log("(no chats)");
    console.log(LIST_SEPARATOR);
    return;
  }

  for (const chat of chats) {
    console.log(`${chat.id} | ${chat.title}`);
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
    case "chats":
      await runChats(rest);
      return;
    default:
      throw new Error(usage());
  }
}

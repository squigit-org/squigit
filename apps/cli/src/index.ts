import { runAuthCommand } from "./commands/auth.js";
import { runApiCommand } from "./commands/apikey.js";
import { runBrainCommand } from "./commands/brain.js";

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/index.js auth <action> [args]",
    "  node dist/src/index.js api <action> [args]",
    "  node dist/src/index.js brain <action> [args]",
    "",
    "Auth actions:",
    "  auth login",
    "  auth signup",
    "  auth logout",
    "  auth remove <id_or_email>",
    "",
    "API actions:",
    "  api add <provider> <key>",
    "  api remove <provider>",
    "  api show <provider>",
    "",
    "Providers:",
    "  google-ai-studio",
    "  imgbb",
    "",
    "Brain actions:",
    "  brain analyze <image_path> [user_message...]",
    "  brain prompt <chat_id> <message...>",
  ].join("\n");
}

async function main(): Promise<void> {
  const [category, ...rest] = process.argv.slice(2);

  if (!category) {
    throw new Error(usage());
  }

  switch (category) {
    case "auth":
      await runAuthCommand(rest);
      return;
    case "api":
      await runApiCommand(rest);
      return;
    case "brain":
      await runBrainCommand(rest);
      return;
    default:
      throw new Error(`Unknown category '${category}'.\n\n${usage()}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });

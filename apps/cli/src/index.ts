import { runAuthCommand } from "./commands/auth.js";
import { runApiCommand } from "./commands/apikey.js";
import { runBrainCommand } from "./commands/brain.js";
import { runSttCommand } from "./commands/stt.js";

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/index.js auth <action> [args]",
    "  node dist/src/index.js api <action> [args]",
    "  node dist/src/index.js brain <action> [args]",
    "  node dist/src/index.js stt <action> [args]",
    "",
    "CLI commands are placeholders while Electron owns the native command contract.",
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
    case "stt":
      await runSttCommand(rest);
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

import { cliNativeUnavailable } from "../harness.js";

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/index.js api <action> [args]",
    "",
    "API-key CLI commands are placeholders while Electron owns the command contract.",
  ].join("\n");
}

export async function runApiCommand(args: string[]): Promise<void> {
  if (args.length === 0) {
    throw new Error(usage());
  }

  cliNativeUnavailable(`api ${args[0]}`);
}

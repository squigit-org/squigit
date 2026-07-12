import { cliNativeUnavailable } from "../harness.js";

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/index.js auth <action> [args]",
    "",
    "Auth CLI commands are placeholders while Electron owns the command contract.",
  ].join("\n");
}

export async function runAuthCommand(args: string[]): Promise<void> {
  if (args.length === 0) {
    throw new Error(usage());
  }

  cliNativeUnavailable(`auth ${args[0]}`);
}

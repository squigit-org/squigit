import { cliNativeUnavailable } from "../harness.js";

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/index.js brain <action> [args]",
    "",
    "Brain CLI commands are placeholders while Electron owns the command contract.",
  ].join("\n");
}

export async function runBrainCommand(args: string[]): Promise<void> {
  if (args.length === 0) {
    throw new Error(usage());
  }

  cliNativeUnavailable(`brain ${args[0]}`);
}

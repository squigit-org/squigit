import { cliNativeUnavailable } from "../harness.js";

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/index.js stt <action> [args]",
    "",
    "STT CLI commands are placeholders while Electron owns the command contract.",
  ].join("\n");
}

export async function runSttCommand(args: string[]): Promise<void> {
  if (args.length === 0) {
    throw new Error(usage());
  }

  cliNativeUnavailable(`stt ${args[0]}`);
}

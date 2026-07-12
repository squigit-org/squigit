import { startStt, stopStt, type NapiSttEvent } from "../harness.js";

type SttAction = "dictate";

type DictateOptions = {
  model?: string;
  language?: string;
};

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/index.js stt dictate [--model <name>] [--language <lang>]",
  ].join("\n");
}

function parseAction(rawAction: string | undefined): SttAction {
  if (rawAction === "dictate") {
    return rawAction;
  }
  throw new Error(`Unknown stt action '${rawAction ?? ""}'.\n\n${usage()}`);
}

function parseDictateOptions(args: string[]): DictateOptions {
  const options: DictateOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--model") {
      const value = args[++i]?.trim();
      if (!value) throw new Error("--model requires a value.");
      options.model = value;
      continue;
    }
    if (arg === "--language") {
      const value = args[++i]?.trim();
      if (!value) throw new Error("--language requires a value.");
      options.language = value;
      continue;
    }
    throw new Error(`Unknown stt option '${arg}'.\n\n${usage()}`);
  }
  return options;
}

async function runDictate(args: string[]): Promise<void> {
  const options = parseDictateOptions(args);

  console.log("[stt] listening. Press Ctrl-C to stop.");
  process.stdin.resume();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let hasInterim = false;

    const finish = async (error?: Error) => {
      if (settled) return;
      settled = true;
      process.off("SIGINT", handleSigint);
      process.stdin.pause();
      try {
        await stopStt();
      } catch {}
      if (hasInterim) process.stdout.write("\n");
      if (error) reject(error);
      else resolve();
    };

    const handleSigint = () => {
      void finish();
    };

    const onEvent = (err: null | Error, event: NapiSttEvent) => {
      if (err) {
        void finish(err);
        return;
      }

      if (event.eventType === "status" && event.status) {
        console.error(`[stt] ${event.status}`);
        return;
      }

      if (event.eventType === "error") {
        void finish(new Error(event.message || "STT failed."));
        return;
      }

      if (event.eventType !== "transcription" || !event.text) {
        return;
      }

      const text = event.text.trim();
      if (!text) return;

      if (event.isFinal) {
        process.stdout.write(`\r${text}\n`);
        hasInterim = false;
      } else {
        process.stdout.write(`\r${text}`);
        hasInterim = true;
      }
    };

    process.once("SIGINT", handleSigint);
    startStt(options, onEvent).catch((error) => {
      void finish(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

export async function runSttCommand(args: string[]): Promise<void> {
  const action = parseAction(args[0]);
  const rest = args.slice(1);

  switch (action) {
    case "dictate":
      await runDictate(rest);
      return;
    default:
      throw new Error(usage());
  }
}

import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

export type AuthPayload = {
  id: string;
  email: string;
  name: string;
  avatar: string;
  original_picture: string;
};

function buildProfileStoreHarnessArgs(args: string[]): string[] {
  return [
    "run",
    "-q",
    "-p",
    "ops-profile-store",
    "--example",
    "live_store_harness",
    "--",
    ...args,
  ];
}

type HarnessResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

async function runCargo(args: string[]): Promise<HarnessResult> {
  const child = spawn("cargo", args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const [code] = (await once(child, "close")) as [number | null];
  return { stdout, stderr, code };
}

export async function runHarness(args: string[]): Promise<string> {
  const { stdout, stderr, code } = await runCargo(buildProfileStoreHarnessArgs(args));

  if (code !== 0) {
    throw new Error(
      stderr.trim() || stdout.trim() || `Harness exited with code ${code ?? "unknown"}`,
    );
  }

  return stdout;
}

export async function runBrainHarness(args: string[]): Promise<string> {
  const child = spawn(
    "cargo",
    [
      "run",
      "-q",
      "-p",
      "ops-squigit-brain",
      "--example",
      "live_brain_harness",
      "--",
      ...args,
    ],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    },
  );

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const [code] = (await once(child, "close")) as [number | null];

  if (code !== 0) {
    throw new Error(
      stderr.trim() || stdout.trim() || `Harness exited with code ${code ?? "unknown"}`,
    );
  }

  return stdout;
}

export function parseLastJsonLine<T>(stdout: string): T {
  const jsonLine = stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!jsonLine) {
    throw new Error("Command completed without a JSON payload.");
  }

  return JSON.parse(jsonLine) as T;
}

export async function getStoreBaseDir(): Promise<string> {
  return (await runHarness(["store-base-dir"])).trim();
}

const AUTH_TIMEOUT_SECONDS = 60;

function formatAuthCountdown(secondsRemaining: number): string {
  return `[auth] Esc to cancel (${secondsRemaining}s remaining)`;
}

export async function runAuthHarnessWithCancellation(
  timeoutSeconds = AUTH_TIMEOUT_SECONDS,
): Promise<AuthPayload> {
  console.log("[auth] Starting browser sign-in flow...");

  const child = spawn("cargo", buildProfileStoreHarnessArgs(["auth-google"]), {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let stdout = "";
  let stderr = "";
  let cancelForwarded = false;
  let timedOut = false;

  const useInlineCountdown = Boolean(process.stderr.isTTY);
  const renderCountdown = (secondsRemaining: number, finalize = false): void => {
    const line = formatAuthCountdown(secondsRemaining);
    if (!useInlineCountdown) {
      process.stderr.write(`${line}\n`);
      return;
    }

    process.stderr.write(`\r${line.padEnd(64)}`);
    if (finalize) {
      process.stderr.write("\n");
    }
  };

  const forwardCancellation = (signal: NodeJS.Signals, label: string): void => {
    if (cancelForwarded || child.exitCode !== null || child.killed) {
      return;
    }

    cancelForwarded = true;
    if (useInlineCountdown) {
      process.stderr.write("\n");
    }
    process.stderr.write(`[auth] cancellation requested via ${label}.\n`);
    child.kill(signal);
  };

  const onSigint = () => forwardCancellation("SIGINT", "SIGINT");
  const onSigterm = () => forwardCancellation("SIGTERM", "SIGTERM");

  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  renderCountdown(timeoutSeconds);
  let remainingSeconds = timeoutSeconds;
  const countdownInterval = setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      timedOut = true;
      clearInterval(countdownInterval);
      renderCountdown(0, true);
      forwardCancellation("SIGTERM", `timeout (${timeoutSeconds}s)`);
      return;
    }
    renderCountdown(remainingSeconds);
  }, 1000);

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const stdin = process.stdin;
  const canReadEsc = Boolean(stdin.isTTY && typeof stdin.setRawMode === "function");
  const stdinWasRaw = canReadEsc ? Boolean(stdin.isRaw) : false;

  const onStdinData = (chunk: Buffer): void => {
    for (const byte of chunk.values()) {
      if (byte === 0x03) {
        forwardCancellation("SIGINT", "Ctrl+C");
        return;
      }

      if (byte === 0x1b) {
        forwardCancellation("SIGINT", "Esc");
        return;
      }
    }
  };

  if (canReadEsc) {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onStdinData);
  }

  try {
    const [code] = (await once(child, "close")) as [number | null];

    if (code !== 0) {
      if (timedOut) {
        throw new Error(`Authentication timed out after ${timeoutSeconds}s.`);
      }

      const errorMessage =
        stderr.trim() || stdout.trim() || `Harness exited with code ${code ?? "unknown"}`;
      throw new Error(errorMessage);
    }

    return parseLastJsonLine<AuthPayload>(stdout);
  } finally {
    clearInterval(countdownInterval);
    if (useInlineCountdown) {
      process.stderr.write("\r".concat(" ".repeat(80)).concat("\r"));
    }

    if (canReadEsc) {
      stdin.off("data", onStdinData);
      stdin.setRawMode(stdinWasRaw);
      stdin.pause();
    }

    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}

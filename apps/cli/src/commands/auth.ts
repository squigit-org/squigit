import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type NapiAuthResult,
  getStoreBaseDir,
  startGoogleAuth,
  listProfiles,
  clearActiveProfile,
  deleteProfile,
  type NapiProfile,
} from "../harness.js";

type AuthAction = "login" | "signup" | "logout" | "remove" | "profiles";

type InfraSnapshot = {
  baseDir: string;
  configPath: string;
  snapshotBaseDir: string;
  snapshotConfigPath: string;
  hadBaseDir: boolean;
  hadConfig: boolean;
  tempDir: string;
};

const LIST_SEPARATOR = "------------------------------------------------------------";

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/index.js auth login",
    "  node dist/src/index.js auth signup",
    "  node dist/src/index.js auth logout",
    "  node dist/src/index.js auth profiles",
    "  node dist/src/index.js auth remove <id_or_email>",
  ].join("\n");
}

function parseAction(args: string[]): { action: AuthAction; rest: string[] } {
  const [action, ...rest] = args;
  if (!action) {
    throw new Error(usage());
  }

  if (
    action !== "login" &&
    action !== "signup" &&
    action !== "logout" &&
    action !== "remove" &&
    action !== "profiles"
  ) {
    throw new Error(`Unknown auth action '${action}'.\n\n${usage()}`);
  }

  return { action, rest };
}

function assertNoArgs(action: AuthAction, rest: string[]): void {
  if (rest.length > 0) {
    throw new Error(`Action '${action}' does not accept arguments.`);
  }
}

async function withSpinner<T>(label: string, task: () => Promise<T>): Promise<T> {
  if (!process.stderr.isTTY) {
    console.error(`[auth] ${label}...`);
    return task();
  }

  const frames = ["|", "/", "-", "\\"];
  let frameIndex = 0;
  const prefix = `[auth] ${label} `;
  const render = (): void => {
    process.stderr.write(`\r${prefix}${frames[frameIndex]}`);
  };

  render();
  const timer = setInterval(() => {
    frameIndex = (frameIndex + 1) % frames.length;
    render();
  }, 100);

  try {
    const result = await task();
    clearInterval(timer);
    process.stderr.write(`\r${prefix}done.\n`);
    return result;
  } catch (error) {
    clearInterval(timer);
    process.stderr.write(`\r${prefix}failed.\n`);
    throw error;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}



async function captureSnapshot(): Promise<InfraSnapshot> {
  const baseDir = await getStoreBaseDir();
  const configPath = path.resolve(baseDir, "..", "config.toml");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "squigit-auth-snapshot-"));
  const snapshotBaseDir = path.join(tempDir, "Local Storage");
  const snapshotConfigPath = path.join(tempDir, "config.toml");

  const hadBaseDir = await pathExists(baseDir);
  if (hadBaseDir) {
    await fs.cp(baseDir, snapshotBaseDir, { recursive: true, force: true });
  }

  const hadConfig = await pathExists(configPath);
  if (hadConfig) {
    await fs.copyFile(configPath, snapshotConfigPath);
  }

  return {
    baseDir,
    configPath,
    snapshotBaseDir,
    snapshotConfigPath,
    hadBaseDir,
    hadConfig,
    tempDir,
  };
}

async function restoreSnapshot(snapshot: InfraSnapshot): Promise<void> {
  await fs.rm(snapshot.baseDir, { recursive: true, force: true });

  if (snapshot.hadBaseDir) {
    await fs.cp(snapshot.snapshotBaseDir, snapshot.baseDir, {
      recursive: true,
      force: true,
    });
  } else {
    await fs.mkdir(snapshot.baseDir, { recursive: true });
  }

  if (snapshot.hadConfig) {
    await fs.mkdir(path.dirname(snapshot.configPath), { recursive: true });
    await fs.copyFile(snapshot.snapshotConfigPath, snapshot.configPath);
  } else {
    await fs.rm(snapshot.configPath, { force: true });
  }
}

async function cleanupSnapshot(snapshot: InfraSnapshot): Promise<void> {
  await fs.rm(snapshot.tempDir, { recursive: true, force: true });
}

async function rollbackWithMessage(snapshot: InfraSnapshot, message: string): Promise<never> {
  try {
    await restoreSnapshot(snapshot);
  } catch (restoreError: unknown) {
    const restoreMessage =
      restoreError instanceof Error ? restoreError.message : String(restoreError);
    throw new Error(`${message}. Rollback failed: ${restoreMessage}`);
  }
  throw new Error(message);
}

const AUTH_TIMEOUT_SECONDS = 60;

function formatAuthCountdown(secondsRemaining: number): string {
  return `[auth] Esc to cancel (${secondsRemaining}s remaining)`;
}

export async function runAuthHarnessWithCancellation(
  timeoutSeconds = AUTH_TIMEOUT_SECONDS,
): Promise<NapiAuthResult> {
  console.log("[auth] Starting browser sign-in flow...");

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

  const stdin = process.stdin;
  const canReadEsc = Boolean(stdin.isTTY && typeof stdin.setRawMode === "function");
  const stdinWasRaw = canReadEsc ? Boolean(stdin.isRaw) : false;

  let cancelled = false;
  
  const onStdinData = (chunk: Buffer): void => {
    for (const byte of chunk.values()) {
      if (byte === 0x03 || byte === 0x1b) {
        cancelled = true;
        process.stderr.write(`\n[auth] cancellation requested.\n`);
        return;
      }
    }
  };

  if (canReadEsc) {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onStdinData);
  }

  renderCountdown(timeoutSeconds);
  let remainingSeconds = timeoutSeconds;
  const countdownInterval = setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      clearInterval(countdownInterval);
      renderCountdown(0, true);
      cancelled = true;
      return;
    }
    renderCountdown(remainingSeconds);
  }, 1000);

  // We are running the blocking startGoogleAuth here
  // Wait, startGoogleAuth blocking means we can't easily interrupt it via Esc in the JS thread 
  // since Node.js thread is blocked in native code.
  // We should really make startGoogleAuth async, but the NAPI wrapper is synchronous now.
  // For Phase 1 we will just call it.
  try {
    const result = startGoogleAuth();
    return result;
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
    
    if (cancelled) {
        process.exit(1);
    }
  }
}

async function runAuthSemanticFlow(action: "login" | "signup"): Promise<void> {
  console.log("[auth] Preparing live profile snapshot...");
  const beforeProfiles = listProfiles();
  const existingIds = new Set(beforeProfiles.map((profile) => profile.id));
  const snapshot = await captureSnapshot();

  try {
    const payload = await runAuthHarnessWithCancellation();
    const alreadyExists = existingIds.has(payload.id);

    if (action === "login" && !alreadyExists) {
      await rollbackWithMessage(snapshot, "account not signed in before");
    }

    if (action === "signup" && alreadyExists) {
      await rollbackWithMessage(snapshot, "account already exists");
    }

    printAuthSuccess(action, payload);
  } finally {
    await cleanupSnapshot(snapshot);
  }
}

function printAuthSuccess(action: "login" | "signup", payload: NapiAuthResult): void {
  if (action === "login") {
    console.log(`logged in as ${payload.email}`);
    return;
  }

  console.log(`signed up as ${payload.email}`);
}

async function runLogout(): Promise<void> {
  clearActiveProfile();
  console.log("logged out");
}

function resolveProfileId(identifier: string, profiles: NapiProfile[]): string {
  const trimmed = identifier.trim();
  if (!trimmed) {
    throw new Error("Action 'remove' requires `<id_or_email>`.");
  }

  const direct = profiles.find((profile) => profile.id === trimmed);
  if (direct) {
    return direct.id;
  }

  const normalized = trimmed.toLowerCase();
  const byEmail = profiles.find((profile) => profile.email.toLowerCase() === normalized);
  if (byEmail) {
    return byEmail.id;
  }

  throw new Error(`No profile found for '${identifier}'.`);
}

async function runRemove(identifier: string): Promise<void> {
  const profiles = listProfiles();
  const profileId = resolveProfileId(identifier, profiles);

  deleteProfile(profileId);
  clearActiveProfile();

  console.log(`removed account ${profileId}`);
}

async function runProfiles(): Promise<void> {
  // listProfiles is synchronous in NAPI now
  const profiles = listProfiles();

  console.log(LIST_SEPARATOR);
  if (profiles.length === 0) {
    console.log("(no profiles)");
    console.log(LIST_SEPARATOR);
    return;
  }

  for (const profile of profiles) {
    console.log(`${profile.id} | ${profile.email}`);
  }
  console.log(LIST_SEPARATOR);
}

export async function runAuthCommand(args: string[]): Promise<void> {
  const { action, rest } = parseAction(args);

  switch (action) {
    case "login":
      assertNoArgs(action, rest);
      await runAuthSemanticFlow("login");
      return;
    case "signup":
      assertNoArgs(action, rest);
      await runAuthSemanticFlow("signup");
      return;
    case "logout":
      assertNoArgs(action, rest);
      await runLogout();
      return;
    case "profiles":
      assertNoArgs(action, rest);
      await runProfiles();
      return;
    case "remove": {
      if (rest.length !== 1) {
        throw new Error("Action 'remove' requires `<id_or_email>`.");
      }
      await runRemove(rest[0]);
      return;
    }
    default:
      throw new Error(usage());
  }
}

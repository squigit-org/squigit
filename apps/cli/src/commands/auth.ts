import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  AuthPayload,
  getStoreBaseDir,
  parseLastJsonLine,
  runAuthHarnessWithCancellation,
  runHarness,
} from "../harness.js";

type AuthAction = "login" | "signup" | "logout" | "remove";

type ProfileRecord = {
  id: string;
  email: string;
  name: string;
};

type InfraSnapshot = {
  baseDir: string;
  preferencesPath: string;
  snapshotBaseDir: string;
  snapshotPreferencesPath: string;
  hadBaseDir: boolean;
  hadPreferences: boolean;
  tempDir: string;
};

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/index.js auth login",
    "  node dist/src/index.js auth signup",
    "  node dist/src/index.js auth logout",
    "  node dist/src/index.js auth remove <id_or_email>",
  ].join("\n");
}

function parseAction(args: string[]): { action: AuthAction; rest: string[] } {
  const [action, ...rest] = args;
  if (!action) {
    throw new Error(usage());
  }

  if (action !== "login" && action !== "signup" && action !== "logout" && action !== "remove") {
    throw new Error(`Unknown auth action '${action}'.\n\n${usage()}`);
  }

  return { action, rest };
}

function assertNoArgs(action: AuthAction, rest: string[]): void {
  if (rest.length > 0) {
    throw new Error(`Action '${action}' does not accept arguments.`);
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

async function listProfiles(): Promise<ProfileRecord[]> {
  const stdout = await runHarness(["list-profiles"]);
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }
  return parseLastJsonLine<ProfileRecord[]>(trimmed);
}

async function setActiveAccountPreference(value: string): Promise<void> {
  const storeBaseDir = await getStoreBaseDir();
  const preferencesPath = path.resolve(storeBaseDir, "..", "preferences.json");

  let preferences: Record<string, unknown> = {};
  try {
    const existing = await fs.readFile(preferencesPath, "utf8");
    preferences = JSON.parse(existing) as Record<string, unknown>;
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") {
      throw error;
    }
  }

  preferences.activeAccount = value;
  await fs.mkdir(path.dirname(preferencesPath), { recursive: true });
  await fs.writeFile(preferencesPath, `${JSON.stringify(preferences, null, 2)}\n`);
}

async function captureSnapshot(): Promise<InfraSnapshot> {
  const baseDir = await getStoreBaseDir();
  const preferencesPath = path.resolve(baseDir, "..", "preferences.json");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "squigit-auth-snapshot-"));
  const snapshotBaseDir = path.join(tempDir, "Local Storage");
  const snapshotPreferencesPath = path.join(tempDir, "preferences.json");

  const hadBaseDir = await pathExists(baseDir);
  if (hadBaseDir) {
    await fs.cp(baseDir, snapshotBaseDir, { recursive: true, force: true });
  }

  const hadPreferences = await pathExists(preferencesPath);
  if (hadPreferences) {
    await fs.copyFile(preferencesPath, snapshotPreferencesPath);
  }

  return {
    baseDir,
    preferencesPath,
    snapshotBaseDir,
    snapshotPreferencesPath,
    hadBaseDir,
    hadPreferences,
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

  if (snapshot.hadPreferences) {
    await fs.mkdir(path.dirname(snapshot.preferencesPath), { recursive: true });
    await fs.copyFile(snapshot.snapshotPreferencesPath, snapshot.preferencesPath);
  } else {
    await fs.rm(snapshot.preferencesPath, { force: true });
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

async function runAuthSemanticFlow(action: "login" | "signup"): Promise<void> {
  console.log("[auth] Preparing live profile snapshot...");
  const beforeProfiles = await listProfiles();
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

    await setActiveAccountPreference(payload.id);
    printAuthSuccess(action, payload);
  } finally {
    await cleanupSnapshot(snapshot);
  }
}

function printAuthSuccess(action: "login" | "signup", payload: AuthPayload): void {
  if (action === "login") {
    console.log(`logged in as ${payload.email}`);
    return;
  }

  console.log(`signed up as ${payload.email}`);
}

async function runLogout(): Promise<void> {
  await runHarness(["clear-active-profile"]);
  await setActiveAccountPreference("Guest");
  console.log("logged out");
}

function resolveProfileId(identifier: string, profiles: ProfileRecord[]): string {
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
  const profiles = await listProfiles();
  const profileId = resolveProfileId(identifier, profiles);

  await runHarness(["delete-profile", profileId]);
  await runHarness(["clear-active-profile"]);
  await setActiveAccountPreference("Guest");

  console.log(`removed account ${profileId}`);
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

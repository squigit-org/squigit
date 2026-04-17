import { runHarness } from "../harness.js";

type ProviderConfig = {
  cliName: "google-ai-studio" | "imgbb";
  storageName: "google ai studio" | "imgbb";
  displayName: "Google AI Studio" | "ImgBB";
  validate: (key: string) => boolean;
};

type ApiAction = "add" | "remove" | "show";

const PROVIDERS: Record<ProviderConfig["cliName"], ProviderConfig> = {
  "google-ai-studio": {
    cliName: "google-ai-studio",
    storageName: "google ai studio",
    displayName: "Google AI Studio",
    validate: (key) => key.startsWith("AIzaS") && key.length === 39,
  },
  imgbb: {
    cliName: "imgbb",
    storageName: "imgbb",
    displayName: "ImgBB",
    validate: (key) => key.length === 32,
  },
};

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/index.js api add <provider> <key>",
    "  node dist/src/index.js api remove <provider>",
    "  node dist/src/index.js api show <provider>",
    "",
    "Providers:",
    "  google-ai-studio",
    "  imgbb",
  ].join("\n");
}

function parseAction(rawAction: string | undefined): ApiAction {
  if (rawAction === "add" || rawAction === "remove" || rawAction === "show") {
    return rawAction;
  }
  throw new Error(`Unknown api action '${rawAction ?? ""}'.\n\n${usage()}`);
}

function resolveProvider(rawProvider: string | undefined): ProviderConfig {
  if (!rawProvider) {
    throw new Error(`Missing provider.\n\n${usage()}`);
  }

  const provider = PROVIDERS[rawProvider as ProviderConfig["cliName"]];
  if (!provider) {
    throw new Error(
      `Unsupported provider '${rawProvider}'. Use 'google-ai-studio' or 'imgbb'.`,
    );
  }

  return provider;
}

function assertValidKey(provider: ProviderConfig, key: string): void {
  if (provider.validate(key)) {
    return;
  }

  if (provider.storageName === "google ai studio") {
    throw new Error(
      "Invalid Google AI Studio key. Expected a key starting with 'AIzaS' and exactly 39 characters.",
    );
  }

  throw new Error("Invalid ImgBB key. Expected exactly 32 characters.");
}

async function ensureActiveProfileId(): Promise<string> {
  const activeProfileId = (await runHarness(["active-profile-id"])).trim();
  if (!activeProfileId) {
    throw new Error(
      "No active profile found. Run `cargo xtask test apps auth login` first.",
    );
  }
  return activeProfileId;
}

async function addKey(provider: ProviderConfig, rawKey: string | undefined): Promise<void> {
  const key = (rawKey ?? "").trim();
  if (!key) {
    throw new Error(addKeyHint(provider));
  }

  assertValidKey(provider, key);
  console.log(`[api] Saving ${provider.displayName} key securely...`);

  const activeProfileId = await ensureActiveProfileId();
  await runHarness(["save-key", activeProfileId, provider.storageName, key]);

  const savedKey = (await runHarness(["get-key", activeProfileId, provider.storageName])).trim();
  if (savedKey !== key) {
    throw new Error(`Saved ${provider.displayName} key could not be verified.`);
  }

  console.log(`saved ${provider.displayName} key`);
}

function addKeyHint(provider: ProviderConfig): string {
  if (provider.cliName === "google-ai-studio") {
    return "you can add in your Google AI Studio: https://aistudio.google.com/app/apikey <provider> <key>";
  }
  return "you can add in your ImgBB API: https://api.imgbb.com/ <provider> <key>";
}

async function removeKey(provider: ProviderConfig): Promise<void> {
  const activeProfileId = await ensureActiveProfileId();
  await runHarness(["save-key", activeProfileId, provider.storageName, ""]);

  const savedKey = (await runHarness(["get-key", activeProfileId, provider.storageName])).trim();
  if (savedKey !== "") {
    throw new Error(`Failed to clear ${provider.displayName} key.`);
  }

  console.log(`removed ${provider.displayName} key`);
}

async function showKey(provider: ProviderConfig): Promise<void> {
  const activeProfileId = await ensureActiveProfileId();
  const key = (await runHarness(["get-key", activeProfileId, provider.storageName])).trim();
  console.log(key || "(empty)");
}

export async function runApiCommand(args: string[]): Promise<void> {
  const action = parseAction(args[0]);
  const provider = resolveProvider(args[1]);

  switch (action) {
    case "add":
      if (args.length === 2) {
        throw new Error(addKeyHint(provider));
      }
      if (args.length !== 3) {
        throw new Error("Usage: api add <provider> <key>");
      }
      await addKey(provider, args[2]);
      return;
    case "remove":
      if (args.length !== 2) {
        throw new Error("Usage: api remove <provider>");
      }
      await removeKey(provider);
      return;
    case "show":
      if (args.length !== 2) {
        throw new Error("Usage: api show <provider>");
      }
      await showKey(provider);
      return;
    default:
      throw new Error(usage());
  }
}

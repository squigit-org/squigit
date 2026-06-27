let addon: any;
try {
  addon = require("napi-bridge");
} catch (e) {
  console.error("Failed to load napi-bridge native addon:", e);
  addon = {};
}

export { addon };

export const requireAddonFn = (name: string) => {
  const fn = addon[name];
  if (typeof fn !== "function") {
    throw new Error(`Missing napi-bridge export '${name}'. Rebuild napi-bridge.`);
  }
  return fn;
};

export const parseAddonJson = <T = any>(label: string, value: unknown): T => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} returned empty JSON from napi-bridge.`);
  }
  return JSON.parse(value) as T;
};


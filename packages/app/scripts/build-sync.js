/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const APP_DIR = path.resolve(__dirname, "..");
const ELECTRON_DIR = path.join(APP_DIR, "src-electron");
const VITE_DIST = path.join(APP_DIR, "dist");
const ELECTRON_REACT_DEST = path.join(ELECTRON_DIR, "renderer", "react-ui");

const args = process.argv.slice(2);
const command = args[0] || "dev";

const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function log(step, message) {
  console.log(`${colors.cyan}[${step}]${colors.reset} ${message}`);
}

function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, FORCE_COLOR: "true" },
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}

function syncReactBuild() {
  log("SYNC", "Copying Vite dist to Electron renderer...");
  
  if (fs.existsSync(ELECTRON_REACT_DEST)) {
    fs.rmSync(ELECTRON_REACT_DEST, { recursive: true, force: true });
  }

  fs.cpSync(VITE_DIST, ELECTRON_REACT_DEST, { recursive: true });
  fs.writeFileSync(path.join(ELECTRON_REACT_DEST, ".gitignore"), "*");
  log("SYNC", `${colors.green}Assets copied to src-electron/renderer/react-ui${colors.reset}`);
}

async function main() {
  try {
    log("VITE", "Building React frontend...");
    await runCommand("npm", ["run", "build"], APP_DIR);

    syncReactBuild();
    
    log("VITE", `${colors.green}Frontend build & sync complete.${colors.reset}`);

    if (command === "dev") {
      log("ELECTRON", "Starting Electron...");
      await runCommand("npm", ["exec", "electron", "."], ELECTRON_DIR);
    } else {
      log(
        "ELECTRON",
        `Packaging for: ${colors.yellow}${command}${colors.reset}`
      );

      let buildFlag = "";
      switch (command) {
        case "win": buildFlag = "--win"; break;
        case "mac": buildFlag = "--mac"; break;
        case "linux": buildFlag = "--linux"; break;
        case "all": buildFlag = "-wml"; break;
      }

      await runCommand("npm", ["run", "build", "--", buildFlag], ELECTRON_DIR);
      log("ELECTRON", `${colors.green}Package complete.${colors.reset}`);
    }
  } catch (e) {
    console.error(`${colors.red}Error:${colors.reset}`, e.message);
    process.exit(1);
  }
}

main();

/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require("fs");
const path = require("path");

const distPath = path.join(__dirname, "..", "dist");
const indexPath = path.join(distPath, "index.html");

fs.readFile(indexPath, "utf8", (err, data) => {
  if (err) {
    console.error("Error reading index.html:", err);
    return;
  }

  const lightData = data.replace("<body", '<body class="light-mode"');
  fs.writeFile(path.join(distPath, "light.html"), lightData, "utf8", (err) => {
    if (err) {
      console.error("Error writing light.html:", err);
      return;
    }
    console.log("light.html created successfully.");
  });

  const darkData = data.replace("<body", '<body class="dark-mode"');
  fs.writeFile(path.join(distPath, "dark.html"), darkData, "utf8", (err) => {
    if (err) {
      console.error("Error writing dark.html:", err);
      return;
    }
    console.log("dark.html created successfully.");
  });
});

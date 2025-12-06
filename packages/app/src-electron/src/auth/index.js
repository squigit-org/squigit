/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { OAuth2Client } = require("google-auth-library");
const { google } = require("googleapis");
const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");

const LOCAL_PORT = 3000;
const REDIRECT_URI = `http://localhost:${LOCAL_PORT}`;

let credentials;
try {
  const credsFile = require("./credentials.json");
  credentials = credsFile.installed;
} catch (e) {
  console.error("CRITICAL: credentials.json not found in auth bundle.", e);
  credentials = {};
}

const client_id = credentials.client_id;
const client_secret = credentials.client_secret;

const scopes = credentials.scopes || [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email"
];

const oAuth2Client = new OAuth2Client(
  client_id,
  client_secret,
  REDIRECT_URI 
);

const htmlTemplate = fs.readFileSync(
  path.join(__dirname, "index.html"),
  "utf8"
);

function generateHtmlResponse(title, bodyContent, isError = false) {
  const titleColor = isError ? "#d93025" : "#202124";
  const breadcrumb = isError ? "Error" : "Confirmation";
  const dynamicStyle = `<style>:root { --title-color: ${titleColor}; }</style>`;

  return htmlTemplate
    .replace(/\${title}/g, title)
    .replace(/\${dynamicStyle}/g, dynamicStyle)
    .replace(/\${breadcrumb}/g, breadcrumb)
    .replace(/\${bodyContent}/g, bodyContent);
}

async function authenticate() {
  return new Promise(async (resolve, reject) => {
    const authorizeUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: Array.isArray(scopes) ? scopes.join(" ") : scopes,
    });

    const server = http
      .createServer(async (req, res) => {
        try {
          const parsed = new url.URL(req.url, REDIRECT_URI);
          const pathname = parsed.pathname;

          if (pathname === "/favicon.png" || pathname === "/favicon.ico") {
            const favPath = path.join(__dirname, "favicon.png");
            fs.stat(favPath, (err, stats) => {
              if (err || !stats.isFile()) {
                res.writeHead(404);
                res.end();
                return;
              }
              res.writeHead(200, {
                "Content-Type": "image/png",
                "Cache-Control": "public, max-age=31536000, immutable",
              });
              fs.createReadStream(favPath).pipe(res);
            });
            return;
          }

          const qs = parsed.searchParams;
          const code = qs.get("code");

          if (!code) {
            if (req.url === "/" || req.url.startsWith("/?")) {
              throw new Error("No code found in the callback URL.");
            }
            return;
          }

          const { tokens } = await oAuth2Client.getToken(code);
          oAuth2Client.setCredentials(tokens);

          const people = google.people({ version: "v1", auth: oAuth2Client });
          const { data: profile } = await people.people.get({
            resourceName: "people/me",
            personFields: "names,emailAddresses,photos",
          });

          const successBody = `
            <p>The authentication was successful, and the following products are now authorized to access your account:</p>
            <ul>
                <li><a href="https://github.com/a7mddra/spatialshot.git" target="_blank" rel="noopener noreferrer">Spatialshot</a></li>
                <li><a href="https://github.com/a7mddra/spatialshot.git" target="_blank" rel="noopener noreferrer">Spatialshot CLI</a></li>
            </ul>
            <p>You can close this window and return to your app.</p>
          `;

          const responseHtml = generateHtmlResponse(
            "Authentication Successful",
            successBody,
            false
          );

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(responseHtml);

          setTimeout(() => {
            server.close();
          }, 1000);

          resolve({ oAuth2Client, profile });
        } catch (e) {
          const errorBody = `
            <p>An error occurred while attempting to authenticate:</p>
            <div class="error-box">
                ${e.message || "Unknown error occurred."}
            </div>
            <p>Please check your network connection, proxy settings, or try running the command again.</p>
          `;

          const responseHtml = generateHtmlResponse(
            "Authentication Failed",
            errorBody,
            true
          );

          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
          res.end(responseHtml);

          server.close();
          reject(e);
        }
      })
      .listen(LOCAL_PORT, async () => {
        const { default: open } = await import("open");
        console.log(`Listening on port ${LOCAL_PORT}...`);
        open(authorizeUrl, { wait: false });
      })
      .on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          reject(new Error(`Port ${LOCAL_PORT} is already in use. Please close other instances.`));
        } else {
          reject(err);
        }
      });
  });
}

module.exports = { authenticate };

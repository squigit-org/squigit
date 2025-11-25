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

let credentials;
try {
  const credsFile = require("./credentials.json");
  credentials = credsFile.web || credsFile.installed;
} catch (e) {
  console.error("CRITICAL: credentials.json not found in auth bundle.", e);
  credentials = {};
}

const client_id = credentials.client_id;
const client_secret = credentials.client_secret;
const redirect_uris = credentials.redirect_uris;
const scopes = credentials.scopes;

const oAuth2Client = new OAuth2Client(
  client_id,
  client_secret,
  redirect_uris[0]
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
      scope: scopes.join(" "),
    });

    const redirectUrlObj = new url.URL(redirect_uris[0]);
    const port = parseInt(redirectUrlObj.port || "3000", 10);

    const server = http
      .createServer(async (req, res) => {
        if (req.url.indexOf("favicon") > -1) {
          res.writeHead(204);
          res.end();
          return;
        }

        try {
          const qs = new url.URL(req.url, redirect_uris[0]).searchParams;
          const code = qs.get("code");

          if (!code) {
            throw new Error("No code found in the callback URL.");
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
                <li><a href="https://github.com/a7mddra/spatialshot.git" target="_blank" rel="noopener noreferrer">SpatialShot</a></li>
                <li><a href="https://github.com/a7mddra/spatialshot.git" target="_blank" rel="noopener noreferrer">SpatialShot CLI</a></li>
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
      .listen(port, async () => {
        const { default: open } = await import("open");
        console.log(`Listening on port ${port}...`);
        open(authorizeUrl, { wait: false });
      })
      .on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          reject(new Error(`Port ${port} is already in use.`));
        } else {
          reject(err);
        }
      });
  });
}

module.exports = { authenticate };

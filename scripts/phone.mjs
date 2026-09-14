#!/usr/bin/env node
/**
 * Phone access with HTTPS — required for camera barcode scanning.
 *
 *   npm run phone           → dev server + HTTPS proxy
 *   npm run phone -- --prod → `next start` + HTTPS proxy (after `next build`)
 *
 * Why this exists: browsers only expose the camera on secure origins. Over the
 * shop WiFi the phone opens http://192.168.x.x:PORT, which is NOT secure, so
 * `navigator.mediaDevices` doesn't even exist and scanning can never work.
 * This script fronts the app with a self-signed HTTPS certificate so the phone
 * can open https://<LAN-IP>:3443 and use the camera. The phone shows a one-time
 * certificate warning — that is expected for a self-signed cert.
 *
 * Env overrides: PHONE_PORT (default 3443), UPSTREAM (default http://127.0.0.1:3000),
 * PHONE_LAN_IP (pin the advertised IP), CERT_DIR (default ./certs).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHONE_PORT = Number(process.env.PHONE_PORT || 3443);
const CERT_DIR = process.env.CERT_DIR || path.join(root, "certs");
const KEY_PATH = path.join(CERT_DIR, "phone-key.pem");
const CERT_PATH = path.join(CERT_DIR, "phone-cert.pem");

function lanIp() {
  const pinned = process.env.PHONE_LAN_IP;
  if (pinned) return pinned;
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

function ensureCerts(ip) {
  if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) return;
  fs.mkdirSync(CERT_DIR, { recursive: true });
  console.log("Generating a self-signed certificate (one-time)…");
  const san = `DNS:localhost,IP:127.0.0.1,IP:${ip}`;
  // -days 825: the longest validity iOS Safari accepts without extra ceremony.
  const result = spawnSyncSafe(
    "openssl",
    [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", KEY_PATH, "-out", CERT_PATH,
      "-days", "825", "-subj", "/CN=Milan Grocery Phone",
      "-addext", `subjectAltName=${san}`,
    ],
  );
  if (result.status !== 0) {
    console.error("Could not run openssl to create the certificate. Install openssl and retry.");
    console.error(result.stderr || result.error?.message || "");
    process.exit(1);
  }
}

function spawnSyncSafe(cmd, args) {
  try {
    return spawnSync(cmd, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  } catch (error) {
    return { status: 1, error, stderr: "" };
  }
}

function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

function waitUntilResponsive(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const req = http.get(url, () => { req.destroy(); resolve(true); });
      req.once("error", () => {
        req.destroy();
        if (Date.now() - started > timeoutMs) resolve(false);
        else setTimeout(tick, 500);
      });
    };
    tick();
  });
}

/** One-shot check: does an HTTP server answer at this URL right now? */
function responds(url) {
  return waitUntilResponsive(url, 1500);
}

async function main() {
  const prod = process.argv.includes("--prod");
  const ip = lanIp();
  ensureCerts(ip);

  let upstream = process.env.UPSTREAM || "http://127.0.0.1:3000";
  const upstreamUrl = new URL(upstream);

  // If something already answers upstream, reuse it. If the port is mid-bind
  // (a server started at the same moment), wait for it instead of racing it.
  if (await responds(upstream)) {
    console.log(`Reusing the app server already running on ${upstream}`);
  } else if (!(await portFree(Number(upstreamUrl.port || 80)))) {
    const ready = await waitUntilResponsive(upstream, 30000);
    if (!ready) {
      console.error(`Something occupies ${upstream} but does not answer. Stop it or set UPSTREAM.`);
      process.exit(1);
    }
    console.log(`Reusing the app server that just came up on ${upstream}`);
  } else {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["next", prod ? "start" : "dev", "-H", "127.0.0.1", "-p", upstreamUrl.port],
      { cwd: root, stdio: "inherit", env: process.env },
    );
    child.on("exit", (code) => process.exit(code ?? 0));
    console.log(`Starting Next ${prod ? "production" : "dev"} server on ${upstream}…`);
    const ready = await waitUntilResponsive(upstream, 120000);
    if (!ready) {
      console.error("The Next server did not become ready in time. Check the output above.");
      process.exit(1);
    }
  }

  const proxy = https.createServer(
    { key: fs.readFileSync(KEY_PATH), cert: fs.readFileSync(CERT_PATH) },
    (req, res) => {
      const target = new URL(req.url ?? "/", upstream);
      const forwarded = http.request(
        target,
        { method: req.method, headers: { ...req.headers, host: upstreamUrl.host } },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        },
      );
      forwarded.on("error", () => {
        res.writeHead(502);
        res.end("The app server is not running. Start it with `npm run dev`.");
      });
      req.pipe(forwarded);
    },
  );

  // Next dev uses WebSockets for fast-refresh — tunnel upgrades too.
  proxy.on("upgrade", (req, clientSocket, head) => {
    const target = new URL(req.url ?? "/", upstream);
    const upstreamSocket = net.connect(
      Number(upstreamUrl.port || 80),
      upstreamUrl.hostname,
      () => {
        const lines = [
          `GET ${target.pathname}${target.search} HTTP/1.1`,
          ...Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`),
          `Host: ${upstreamUrl.host}`,
        ];
        upstreamSocket.write(lines.join("\r\n") + "\r\n\r\n");
        if (head?.length) upstreamSocket.write(head);
        upstreamSocket.pipe(clientSocket);
        clientSocket.pipe(upstreamSocket);
      },
    );
    upstreamSocket.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => upstreamSocket.destroy());
  });

  await new Promise((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(PHONE_PORT, "0.0.0.0", resolve);
  });

  const phoneUrl = `https://${ip}:${PHONE_PORT}`;
  const desktopUrl = `https://localhost:${PHONE_PORT}`;

  console.log("");
  console.log("  ┌─────────────────────────────────────────────────────────┐");
  console.log(`  │  Phone (same WiFi):  ${phoneUrl.padEnd(34)}│`);
  console.log(`  │  This computer:      ${desktopUrl.padEnd(34)}│`);
  console.log("  └─────────────────────────────────────────────────────────┘");
  console.log("");
  console.log("  The phone will show a one-time certificate warning");
  console.log("  (Chrome: Advanced → Proceed to …). Camera scanning works");
  console.log("  only through this https:// address — not the http:// one.");
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

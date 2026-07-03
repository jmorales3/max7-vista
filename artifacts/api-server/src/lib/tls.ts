/**
 * TLS support for self-hosted / LAN-mode deployments.
 *
 * Replit cloud deployments are always served over HTTPS by Replit's proxy,
 * which forwards to this server over plain HTTP internally — that path is
 * untouched by this module.
 *
 * Self-hosted clinics running the server directly on their LAN (Electron
 * desktop app, or `./scripts/start-server.sh`) are NOT behind any proxy:
 * without this, patient images and credentials travel across the clinic
 * Wi-Fi in cleartext. This module lets that deployment mode opt into HTTPS,
 * either with:
 *   - a certificate the clinic's IT department already has (TLS_CERT_PATH /
 *     TLS_KEY_PATH), or
 *   - an auto-generated, locally-trusted self-signed certificate covering
 *     the machine's LAN IP addresses and localhost, cached on disk so it is
 *     stable across restarts.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { logger } from "./logger";

export interface TlsCredentials {
  cert: string;
  key: string;
  /** true if this is a locally-generated self-signed cert (not CA-trusted) */
  selfSigned: boolean;
}

function collectLanIpAddresses(): string[] {
  const nets = os.networkInterfaces();
  const addresses: string[] = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

/**
 * Returns TLS credentials to use for the HTTPS listener, or null if HTTPS
 * is not enabled for this run. Reads (in priority order):
 *   1. TLS_CERT_PATH + TLS_KEY_PATH — clinic-provided certificate/key files
 *   2. ENABLE_HTTPS=true — auto-generate (or reuse a cached) self-signed cert
 */
export async function getTlsCredentials(): Promise<TlsCredentials | null> {
  const certPath = process.env["TLS_CERT_PATH"];
  const keyPath = process.env["TLS_KEY_PATH"];

  if (certPath && keyPath) {
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      throw new Error(
        `TLS_CERT_PATH/TLS_KEY_PATH were set but the files were not found: "${certPath}", "${keyPath}"`
      );
    }
    return {
      cert: fs.readFileSync(certPath, "utf8"),
      key: fs.readFileSync(keyPath, "utf8"),
      selfSigned: false,
    };
  }

  if (process.env["ENABLE_HTTPS"] !== "true") {
    return null;
  }

  return getOrCreateSelfSignedCert();
}

/**
 * Generates a self-signed certificate covering localhost + all current LAN
 * IPs, caching it under USER_DATA_DIR (Electron) or the repo root's
 * `.tls-cert` directory so it survives restarts and doesn't trigger a new
 * browser trust warning every time the server starts.
 */
async function getOrCreateSelfSignedCert(): Promise<TlsCredentials> {
  const certDir =
    process.env["USER_DATA_DIR"]
      ? path.join(process.env["USER_DATA_DIR"], "tls-cert")
      : path.join(process.cwd(), ".tls-cert");

  const certFile = path.join(certDir, "cert.pem");
  const keyFile = path.join(certDir, "key.pem");

  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    logger.info({ certDir }, "Reusing cached self-signed TLS certificate");
    return {
      cert: fs.readFileSync(certFile, "utf8"),
      key: fs.readFileSync(keyFile, "utf8"),
      selfSigned: true,
    };
  }

  const { generate } = await import("selfsigned");
  const lanIps = collectLanIpAddresses();
  const altNames: Array<{ type: 2 | 7; value?: string; ip?: string }> = [
    { type: 2, value: "localhost" }, // DNS
    { type: 7, ip: "127.0.0.1" }, // IP
    ...lanIps.map((ip): { type: 7; ip: string } => ({ type: 7, ip })),
  ];

  const notAfterDate = new Date();
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 10);

  const pems = await generate(
    [{ name: "commonName", value: "max7-vista-self-hosted" }],
    {
      notAfterDate,
      keySize: 2048,
      extensions: [
        { name: "basicConstraints", cA: false },
        { name: "keyUsage", keyCertSign: false, digitalSignature: true, keyEncipherment: true },
        { name: "subjectAltName", altNames },
      ],
    }
  );

  fs.mkdirSync(certDir, { recursive: true });
  fs.writeFileSync(certFile, pems.cert, { mode: 0o600 });
  fs.writeFileSync(keyFile, pems.private, { mode: 0o600 });

  logger.info(
    { certDir, lanIps },
    "Generated new self-signed TLS certificate for self-hosted HTTPS. Browsers/apps will show a trust warning on first connect (expected for self-signed certs) — see SELF_HOSTING.md."
  );

  return { cert: pems.cert, key: pems.private, selfSigned: true };
}

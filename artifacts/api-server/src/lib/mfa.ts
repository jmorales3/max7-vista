import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const ISSUER = "Max7 Vista";

export function generateMfaSecret(): string {
  return generateSecret();
}

export function buildOtpAuthUrl(username: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: username, secret });
}

export async function generateQrCodeDataUrl(otpAuthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpAuthUrl);
}

export async function verifyTotpToken(token: string, secret: string): Promise<boolean> {
  try {
    const result = await verify({ token, secret, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}

const BACKUP_CODE_COUNT = 10;

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = crypto.randomBytes(5).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-");
    codes.push(code);
  }
  return codes;
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
}

export async function verifyAndConsumeBackupCode(
  code: string,
  hashedCodes: string[],
): Promise<{ valid: boolean; remaining: string[] }> {
  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await bcrypt.compare(code.trim().toUpperCase(), hashedCodes[i]);
    if (match) {
      const remaining = [...hashedCodes];
      remaining.splice(i, 1);
      return { valid: true, remaining };
    }
  }
  return { valid: false, remaining: hashedCodes };
}

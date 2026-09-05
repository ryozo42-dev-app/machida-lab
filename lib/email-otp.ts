import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

export const EMAIL_OTP_EXPIRES_IN_SECONDS = 10 * 60;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
export const EMAIL_OTP_RESEND_INTERVAL_SECONDS = 60;

const CHALLENGE_TOKEN_BYTES = 32;

function getEmailOtpHmacSecret() {
  const secret = process.env.EMAIL_OTP_HMAC_SECRET;

  if (!secret) {
    throw new Error("EMAIL_OTP_HMAC_SECRET is required");
  }

  return secret;
}

export function generateEmailOtp() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function generateEmailOtpChallengeToken() {
  return randomBytes(CHALLENGE_TOKEN_BYTES).toString("base64url");
}

export function hashEmailOtpChallengeToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashEmailOtp({
  challengeToken,
  otp,
}: {
  challengeToken: string;
  otp: string;
}) {
  return createHmac("sha256", getEmailOtpHmacSecret())
    .update(`${challengeToken}:${otp}`)
    .digest("hex");
}

export function verifyEmailOtp({
  challengeToken,
  otp,
  expectedHash,
}: {
  challengeToken: string;
  otp: string;
  expectedHash: string;
}) {
  const actualHash = hashEmailOtp({
    challengeToken,
    otp,
  });
  const actualBuffer = Buffer.from(actualHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

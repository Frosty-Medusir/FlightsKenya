import { timingSafeEqual } from "node:crypto";

export function isCollectorAuthorized(
  authorization: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

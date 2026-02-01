import "server-only";
import { adminAuth } from "@/lib/firebase/admin";
import { DecodedIdToken } from "firebase-admin/auth";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

type AuthContext = {
  uid: string;
  email?: string;
  token: string;
  decoded: DecodedIdToken;
};

function parseBearerToken(req: Request): string {
  const header = req.headers.get("authorization");
  if (!header) throw new AuthError("Missing Authorization header", 401);

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AuthError("Authorization header must be: Bearer <token>", 401);
  }
  return token.trim();
}

export async function requireAuth(req: Request): Promise<AuthContext> {
  const token = parseBearerToken(req);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email ?? undefined,
      token,
      decoded,
    };
  } catch (err: unknown) {
    throw new AuthError("Invalid or expired ID token", 401);
  }
}

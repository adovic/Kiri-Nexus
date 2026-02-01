import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth/verify";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firestore/schema";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const userDoc = await adminDb.collection(COLLECTIONS.users).doc(auth.uid).get();
    const activeTenantId = (userDoc.data()?.activeTenantId as string | undefined) ?? null;

    return NextResponse.json({ uid: auth.uid, email: auth.email ?? null, activeTenantId });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("whoami error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

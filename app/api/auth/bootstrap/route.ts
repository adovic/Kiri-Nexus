import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { AuthError, requireAuth } from "@/lib/auth/verify";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS, SUBCOLLECTIONS } from "@/lib/firestore/schema";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const tenantName = (body?.tenantName as string | undefined) ?? "My Business";
    const tenantId = nanoid(12);
    const now = Date.now();

    const userRef = adminDb.collection(COLLECTIONS.users).doc(auth.uid);
    const tenantRef = adminDb.collection(COLLECTIONS.tenants).doc(tenantId);
    const memberRef = tenantRef.collection(SUBCOLLECTIONS.members).doc(auth.uid);
    const receptionistRef = tenantRef.collection(SUBCOLLECTIONS.receptionist).doc("default");
    const intakeRef = tenantRef.collection(SUBCOLLECTIONS.intakeForms).doc("default");

    await adminDb.runTransaction(async (tx) => {
      tx.set(
        userRef,
        {
          email: auth.email ?? null,
          activeTenantId: tenantId,
          updatedAt: now,
          createdAt: now,
        },
        { merge: true },
      );

      tx.set(tenantRef, {
        name: tenantName,
        ownerUid: auth.uid,
        createdAt: now,
        plan: "trial",
        status: "active",
      });

      tx.set(memberRef, { role: "owner", createdAt: now });

      tx.set(receptionistRef, {
        name: "AI Receptionist",
        tone: "friendly, concise",
        greeting: "Hi! Thanks for calling. I can help take a message and get you to the right person.",
        businessDescription: "Describe your business here.",
        escalationRules: {
          alwaysEscalateUrgency: ["high"],
          businessHoursOnly: false,
        },
        createdAt: now,
        updatedAt: now,
      });

      tx.set(intakeRef, {
        name: "Default Intake",
        active: true,
        fields: [
          { key: "caller_name", label: "What is your name?", type: "string", required: true },
          { key: "intent", label: "What are you calling about?", type: "string", required: true },
          {
            key: "urgency",
            label: "How urgent is this? (low/medium/high)",
            type: "enum",
            options: ["low", "medium", "high"],
            required: true,
          },
          { key: "callback_number", label: "Best callback number?", type: "string", required: false },
        ],
        createdAt: now,
        updatedAt: now,
      });
    });

    return NextResponse.json({ ok: true, tenantId });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("bootstrap error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

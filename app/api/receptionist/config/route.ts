import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { AuthError, requireAuth } from "@/lib/auth/verify";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS, SUBCOLLECTIONS } from "@/lib/firestore/schema";

export const runtime = "nodejs";

type Question = { id: string; label: string; required: boolean };
type Escalation = { enabled: boolean; phoneNumber: string; urgencyThreshold: number };
type ReceptionistConfig = {
  businessName: string;
  businessHours: string;
  greeting: string;
  questions: Question[];
  escalation: Escalation;
  updatedAt?: number | null;
};

const defaultConfig: ReceptionistConfig = {
  businessName: "",
  businessHours: "",
  greeting: "",
  questions: [],
  escalation: { enabled: false, phoneNumber: "", urgencyThreshold: 0 },
  updatedAt: null,
};

function coerceTimestamp(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return null;
}

function normalizeQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q) => {
      if (!q || typeof q !== "object") return null;
      const id = (q as any).id;
      const label = (q as any).label;
      const required = (q as any).required;
      if (typeof id !== "string" || typeof label !== "string" || typeof required !== "boolean") return null;
      return { id, label, required };
    })
    .filter(Boolean) as Question[];
}

function normalizeEscalation(raw: unknown): Escalation {
  if (!raw || typeof raw !== "object") return defaultConfig.escalation;
  const obj = raw as any;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : false,
    phoneNumber: typeof obj.phoneNumber === "string" ? obj.phoneNumber : "",
    urgencyThreshold: typeof obj.urgencyThreshold === "number" ? obj.urgencyThreshold : 0,
  };
}

function normalizeConfig(raw: unknown): ReceptionistConfig {
  if (!raw || typeof raw !== "object") return defaultConfig;
  const data = raw as any;
  return {
    businessName: typeof data.businessName === "string" ? data.businessName : "",
    businessHours: typeof data.businessHours === "string" ? data.businessHours : "",
    greeting: typeof data.greeting === "string" ? data.greeting : "",
    questions: normalizeQuestions(data.questions),
    escalation: normalizeEscalation(data.escalation),
    updatedAt: coerceTimestamp(data.updatedAt),
  };
}

async function getActiveTenantId(uid: string): Promise<string | null> {
  const userSnap = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
  const tenantId = (userSnap.data()?.activeTenantId as string | undefined) ?? null;
  return tenantId;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const tenantId = await getActiveTenantId(auth.uid);
    if (!tenantId) {
      return NextResponse.json({ error: "NO_ACTIVE_TENANT" }, { status: 400 });
    }

    const docRef = adminDb
      .collection(COLLECTIONS.tenants)
      .doc(tenantId)
      .collection(SUBCOLLECTIONS.receptionist)
      .doc("default");
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json(defaultConfig);
    }
    return NextResponse.json(normalizeConfig(snap.data()));
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("receptionist config GET error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const tenantId = await getActiveTenantId(auth.uid);
    if (!tenantId) {
      return NextResponse.json({ error: "NO_ACTIVE_TENANT" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if ("businessName" in body) {
      if (typeof (body as any).businessName !== "string") {
        return NextResponse.json({ error: "INVALID_BUSINESS_NAME" }, { status: 400 });
      }
      update.businessName = (body as any).businessName;
    }

    if ("businessHours" in body) {
      if (typeof (body as any).businessHours !== "string") {
        return NextResponse.json({ error: "INVALID_BUSINESS_HOURS" }, { status: 400 });
      }
      update.businessHours = (body as any).businessHours;
    }

    if ("greeting" in body) {
      if (typeof (body as any).greeting !== "string") {
        return NextResponse.json({ error: "INVALID_GREETING" }, { status: 400 });
      }
      update.greeting = (body as any).greeting;
    }

    if ("questions" in body) {
      if (!Array.isArray((body as any).questions)) {
        return NextResponse.json({ error: "INVALID_QUESTIONS" }, { status: 400 });
      }
      const questions = normalizeQuestions((body as any).questions);
      if (questions.length !== (body as any).questions.length) {
        return NextResponse.json({ error: "INVALID_QUESTIONS" }, { status: 400 });
      }
      update.questions = questions;
    }

    if ("escalation" in body) {
      const esc = (body as any).escalation;
      if (!esc || typeof esc !== "object") {
        return NextResponse.json({ error: "INVALID_ESCALATION" }, { status: 400 });
      }
      const normalizedEsc = normalizeEscalation(esc);
      if (typeof esc.enabled !== "boolean" || typeof esc.phoneNumber !== "string" || typeof esc.urgencyThreshold !== "number") {
        return NextResponse.json({ error: "INVALID_ESCALATION" }, { status: 400 });
      }
      update.escalation = normalizedEsc;
    }

    update.updatedAt = FieldValue.serverTimestamp();

    const docRef = adminDb
      .collection(COLLECTIONS.tenants)
      .doc(tenantId)
      .collection(SUBCOLLECTIONS.receptionist)
      .doc("default");

    await docRef.set(update, { merge: true });
    const saved = await docRef.get();

    return NextResponse.json(normalizeConfig(saved.data()));
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("receptionist config POST error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

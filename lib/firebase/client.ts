import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FirebaseClient = {
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  error: Error | null;
};

// ---------------------------------------------------------------------------
// Environment → FirebaseOptions helpers
// ---------------------------------------------------------------------------

function configFromPublicEnv(): FirebaseOptions | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (apiKey && authDomain && projectId) {
    return { apiKey, authDomain, projectId };
  }
  return null;
}

function configFromHostingEnv(): FirebaseOptions | { error: Error } | null {
  const raw = process.env.FIREBASE_WEBAPP_CONFIG;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const { apiKey, authDomain, projectId, appId, messagingSenderId, storageBucket } = parsed;
    if (!apiKey || !authDomain || !projectId) {
      return { error: new Error("FIREBASE_WEBAPP_CONFIG missing apiKey/authDomain/projectId") };
    }
    const config: FirebaseOptions = { apiKey, authDomain, projectId };
    if (appId) config.appId = appId;
    if (messagingSenderId) config.messagingSenderId = messagingSenderId;
    if (storageBucket) config.storageBucket = storageBucket;
    return config;
  } catch (err) {
    return { error: err instanceof Error ? err : new Error("Invalid FIREBASE_WEBAPP_CONFIG JSON") };
  }
}

// ---------------------------------------------------------------------------
// Singleton cache via globalThis (survives Next.js HMR / module re-evals)
// ---------------------------------------------------------------------------

const CACHE_KEY = "__FIREBASE_CLIENT__" as const;

const globalCache = globalThis as unknown as {
  [CACHE_KEY]?: FirebaseClient;
};

// ---------------------------------------------------------------------------
// Null stub returned during SSR so consumers never crash on the server.
// ---------------------------------------------------------------------------

const SSR_STUB: FirebaseClient = Object.freeze({
  app: null,
  auth: null,
  db: null,
  error: new Error("Firebase client is not available during server-side rendering"),
});

// ---------------------------------------------------------------------------
// Core initializer
// ---------------------------------------------------------------------------

export function getFirebaseClient(): FirebaseClient {
  // ── Guard 1: SSR / non-browser environments ──────────────────────────
  // Firestore (and parts of Auth) depend on browser globals like
  // `window`, `indexedDB`, and `navigator`.  Return a safe stub when
  // running on the server so SSR never crashes.
  if (typeof window === "undefined") {
    return SSR_STUB;
  }

  // ── Guard 2: Return the cached singleton if it already exists ────────
  const cached = globalCache[CACHE_KEY];
  if (cached) {
    // Verify the underlying app is still alive (HMR can tear it down).
    if (cached.app && getApps().length > 0) {
      return cached;
    }
    // App was torn down — clear the stale cache and re-initialize below.
    globalCache[CACHE_KEY] = undefined;
  }

  // ── Resolve configuration ────────────────────────────────────────────
  const publicConfig = configFromPublicEnv();
  const hostingConfig = configFromHostingEnv();

  let config: FirebaseOptions | null = null;
  let configError: Error | null = null;

  if (publicConfig) {
    config = publicConfig;
  } else if (hostingConfig && "error" in hostingConfig) {
    configError = hostingConfig.error;
  } else if (hostingConfig) {
    config = hostingConfig;
  } else {
    configError = new Error(
      "Missing Firebase client config. Set NEXT_PUBLIC_FIREBASE_API_KEY, " +
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, and NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local"
    );
    console.error("[Firebase Client]", configError.message);
  }

  if (!config) {
    const stub: FirebaseClient = { app: null, auth: null, db: null, error: configError };
    globalCache[CACHE_KEY] = stub;
    return stub;
  }

  // ── Initialize Firebase ──────────────────────────────────────────────
  try {
    const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(config);

    const client: FirebaseClient = {
      app,
      auth: getAuth(app),
      db: getFirestore(app),
      error: null,
    };

    globalCache[CACHE_KEY] = client;
    return client;
  } catch (err) {
    const error = err instanceof Error ? err : new Error("Unknown Firebase init error");
    console.error("[Firebase Client] Initialization failed:", error.message);
    const stub: FirebaseClient = { app: null, auth: null, db: null, error };
    globalCache[CACHE_KEY] = stub;
    return stub;
  }
}

// ---------------------------------------------------------------------------
// Convenience accessors (throw descriptive errors when not initialized)
// ---------------------------------------------------------------------------

export function getDb(): Firestore {
  const { db, error } = getFirebaseClient();
  if (!db) {
    throw new Error(`Firebase DB not initialized: ${error?.message ?? "Unknown error"}`);
  }
  return db;
}

export function getFirebaseAuth(): Auth {
  const { auth, error } = getFirebaseClient();
  if (!auth) {
    throw new Error(`Firebase Auth not initialized: ${error?.message ?? "Unknown error"}`);
  }
  return auth;
}

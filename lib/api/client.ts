'use client';

import { getFirebaseClient } from "@/lib/firebase/client";

export async function getIdToken(forceRefresh = false): Promise<string> {
  const { auth } = getFirebaseClient();
  if (!auth) throw new Error("Firebase auth not initialized");
  const user = auth.currentUser;
  if (!user) throw new Error("No signed-in user");
  return user.getIdToken(forceRefresh);
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getIdToken();
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, {
    ...options,
    headers,
  });
}

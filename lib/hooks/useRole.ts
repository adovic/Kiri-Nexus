'use client';

import { useEffect, useState } from "react";

export type Role = "owner" | "admin" | "member";

export function useRole() {
  const [role, setRole] = useState<Role>("owner");

  useEffect(() => {
    // Placeholder: fetch role from backend when available. Keeps UI controllable for now.
    setRole("owner");
  }, []);

  const isOwner = role === "owner";
  const isAdmin = role === "admin" || role === "owner";

  return { role, isOwner, isAdmin };
}

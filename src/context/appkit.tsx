// src/context/appkit.tsx
"use client";

import React from "react";

// Get projectId from https://dashboard.reown.com (Reown Cloud)
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const appkitEnabled = Boolean(projectId);

export function AppKitProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

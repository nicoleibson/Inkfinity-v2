// src/context/appkit.tsx
"use client";

import React from "react";

// Get projectId from https://dashboard.reown.com (Reown Cloud)
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const appkitEnabled = Boolean(projectId);

export function AppKitProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/*
        The element AppKit renders its wallet list into.

        `createAppKit()` and `open()` work without it — state hooks resolve, the
        open call is dispatched — but nothing appears on screen, which is why the
        wallet picker (World App included) never showed up. Keep this mounted
        whenever a projectId is configured.
      */}
      <appkit-modal />
    </>
  );
}

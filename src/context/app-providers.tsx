// src/context/app-providers.tsx
"use client";

import { ThemeProvider } from "@/context/theme-provider";
import { WalletProvider } from "@/context/wallet-provider";
import { AppKitProvider } from "@/context/appkit";
import React from "react";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
    >
      <AppKitProvider>
        <WalletProvider>
          {children}
        </WalletProvider>
      </AppKitProvider>
    </ThemeProvider>
  );
}

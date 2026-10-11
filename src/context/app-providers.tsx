// src/context/app-providers.tsx
"use client";

import { ThemeProvider } from "@/context/theme-provider";
import { WalletProvider } from "@/context/wallet-provider";
import React from "react";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
    >
      <WalletProvider>
          {children}
        </WalletProvider>
    </ThemeProvider>
  );
}

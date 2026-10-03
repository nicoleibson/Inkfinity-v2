// src/context/appkit-bridge.tsx
"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAppKit, useAppKitAccount, useAppKitNetwork, useAppKitProvider, useDisconnect, createAppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { polygon, polygonAmoy, worldchain, worldchainSepolia, type AppKitNetwork } from "@reown/appkit/networks";
import type { Eip1193Provider } from "ethers";

export const SUPPORTED_APPKIT_NETWORKS: Record<string, AppKitNetwork> = {
  polygon,
  amoy: polygonAmoy,
  worldchain,
  worldchainSepolia,
};

export interface AppKitBridgeState {
  isConnected: boolean;
  address: string | null;
  walletProvider: Eip1193Provider | null;
  caipNetworkId: string | null;
}

export interface AppKitBridgeActions {
  open: (() => void) | null;
  disconnect: (() => Promise<void>) | null;
  switchNetworkByName: ((name: string) => Promise<void>) | null;
}

let appKitInitialized = false;

function ensureAppKit() {
  if (typeof window === "undefined" || appKitInitialized) return;
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
  if (!projectId) return;

  try {
    createAppKit({
      adapters: [new EthersAdapter()],
      metadata: {
        name: "Inkfinity",
        description: "Inkfinity – tattoo art marketplace",
        url: process.env.NEXT_PUBLIC_SITE_URL || "https://inkfinity-ten.vercel.app",
        icons: [],
      },
      // WorldChain first on purpose: AppKit treats the first entry as the active
      // network, and the wallet list in the modal is filtered by the active chain.
      // With any other chain first, the picker offered Polygon wallets and World
      // Chain users had to switch networks before seeing a relevant list.
      networks: [worldchain, polygon, worldchainSepolia, polygonAmoy],
      projectId,
      features: {
        analytics: false,
      },
    });
    appKitInitialized = true;
  } catch (err) {
    console.warn("AppKit initialization failed:", err);
  }
}

if (typeof window !== "undefined") {
  ensureAppKit();
}

export function AppKitBridge({
  onState,
  onActions,
}: {
  onState: (state: AppKitBridgeState) => void;
  onActions: (actions: AppKitBridgeActions) => void;
}) {
  ensureAppKit();

  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<Eip1193Provider>("eip155");
  const { disconnect } = useDisconnect();
  const { switchNetwork, caipNetworkId } = useAppKitNetwork();

  const switchNetworkByName = useCallback(
    async (networkName: string) => {
      // WorldChain is the product's chain, so it is also the fallback when no
      // platform setting has been read yet — never a testnet.
      const net = SUPPORTED_APPKIT_NETWORKS[networkName || "worldchain"];
      if (net) {
        try {
          await switchNetwork(net);
        } catch (e) {
          console.warn("Network switch error:", e);
        }
      }
    },
    [switchNetwork]
  );

  useEffect(() => {
    onActions({ open, disconnect, switchNetworkByName });
  }, [open, disconnect, switchNetworkByName, onActions]);

  const lastSigRef = useRef("");

  useEffect(() => {
    const signature = [isConnected, address ?? "", caipNetworkId ?? ""].join("|");
    if (lastSigRef.current === signature) return;
    lastSigRef.current = signature;
    onState({
      isConnected,
      address: isConnected && address ? address : null,
      walletProvider: isConnected && walletProvider ? walletProvider : null,
      caipNetworkId: caipNetworkId || null,
    });
  }, [isConnected, address, walletProvider, caipNetworkId, onState]);

  return null;
}

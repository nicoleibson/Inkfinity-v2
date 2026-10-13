// src/context/wallet-provider.tsx
"use client";

import { createContext, useState, useContext, ReactNode, useEffect, useCallback } from "react";
import { BrowserProvider, Eip1193Provider } from "ethers";
import { useToast } from "@/hooks/use-toast";
import { auth, database } from "@/lib/firebase-config";
import { ref, update, query, orderByChild, equalTo, get } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { ensureMiniKitInstalled, getWorldAppProviderOrNull, isInWorldApp } from "@/lib/world-app";

// Resilient dynamic loader with retry to guard against transient network/chunk failures

interface IWalletContext {
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  walletAddress: string | null;
  provider: BrowserProvider | null;
  isConnected: boolean;
}

const WalletContext = createContext<IWalletContext | undefined>(undefined);

// AppKit declares `window.ethereum` globally as Record<string, unknown>;
// use a richer local type for the injected-provider (MetaMask) fallback path.
type InjectedEip1193Provider = Eip1193Provider & {
  on(event: string, listener: (...args: any[]) => void): void;
  removeListener(event: string, listener: (...args: any[]) => void): void;
};

const chainParams = {
    polygon: {
        chainId: '0x89', // 137
        chainName: 'Polygon Mainnet',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        rpcUrls: ['https://polygon-rpc.com/'],
        blockExplorerUrls: ['https://polygonscan.com/'],
    },
    amoy: {
        chainId: '0x13882', // 80002
        chainName: 'Polygon Amoy Testnet',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        rpcUrls: ['https://rpc-amoy.polygon.technology/'],
        blockExplorerUrls: ['https://amoy.polygonscan.com/'],
    },
    worldchain: {
        chainId: '0x1E0', // 480
        chainName: 'World Chain',
        nativeCurrency: { name: 'WLD', symbol: 'WLD', decimals: 18 },
        rpcUrls: ['https://worldchain-mainnet.g.alchemy.com/public'],
        blockExplorerUrls: ['https://worldscan.org/'],
    },
    worldchainSepolia: {
        chainId: '0x12C1', // 4801
        chainName: 'World Chain Sepolia',
        nativeCurrency: { name: 'WLD', symbol: 'WLD', decimals: 18 },
        rpcUrls: ['https://worldchain-sepolia.g.alchemy.com/public'],
        blockExplorerUrls: ['https://sepolia.worldscan.org/'],
    }
};

async function linkWalletToAccount(newAddress: string): Promise<{ ok: boolean; inUse: boolean }> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        return { ok: false, inUse: false };
    }

    const usersRef = ref(database, 'users');
    const queryByWallet = query(usersRef, orderByChild('walletAddress'), equalTo(newAddress));
    const snapshot = await get(queryByWallet);

    if (snapshot.exists()) {
        let isOwnedByCurrentUser = false;
        snapshot.forEach((childSnapshot) => {
            if (childSnapshot.key === currentUser.uid) {
                isOwnedByCurrentUser = true;
            }
        });

        if (!isOwnedByCurrentUser) {
            return { ok: false, inUse: true };
        }
    }

    const userRef = ref(database, `users/${currentUser.uid}`);
    await update(userRef, { walletAddress: newAddress });
    return { ok: true, inUse: false };
}

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const { toast } = useToast();
  const { settings } = usePlatformSettings();

  useEffect(() => {
    ensureMiniKitInstalled();
    setMounted(true);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userRef = ref(database, `users/${user.uid}/walletAddress`);
          const snapshot = await get(userRef);
          let linkedAddress: string | null = snapshot.exists() ? snapshot.val() : null;

          if (isInWorldApp()) {
            const worldAppProvider = getWorldAppProviderOrNull();
            if (worldAppProvider) {
              const browserProvider = new BrowserProvider(worldAppProvider);
              setProvider(browserProvider);

              // If no wallet is linked in the user profile yet, try to auto-detect from World App
              if (!linkedAddress) {
                try {
                  const accounts = (await browserProvider.send("eth_accounts", [])) as string[];
                  if (accounts && accounts.length > 0) {
                    const autoAddress = accounts[0];
                    const { ok } = await linkWalletToAccount(autoAddress);
                    if (ok) {
                      linkedAddress = autoAddress;
                    }
                  }
                } catch (e) {
                  console.warn("Could not auto-read World App accounts:", e);
                }
              }
            }
          }

          setWalletAddress(linkedAddress);
        } catch (err) {
          console.error("Error restoring wallet state:", err);
        }
      } else {
        setWalletAddress(null);
        setProvider(null);
      }
    });

    return () => unsubscribe();
  }, []);



  const disconnectWallet = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
        const userRef = ref(database, `users/${currentUser.uid}`);
        await update(userRef, { walletAddress: null });
        toast({ title: "Wallet Disconnected", description: "Your wallet has been unlinked from your profile." });
    }
    setWalletAddress(null);
    setProvider(null);
    console.log("Wallet disconnected.");
  }, [toast]);

  const connectWallet = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast({ variant: "destructive", title: "Not Logged In", description: "You must be logged in to connect a wallet." });
      return;
    }
    if (!isInWorldApp()) {
      toast({ variant: "destructive", title: "World App Required", description: "Open this app inside the World App to connect your World Wallet and pay in WLD." });
      return;
    }
    ensureMiniKitInstalled();
    const worldAppProvider = getWorldAppProviderOrNull();
    if (!worldAppProvider) {
      toast({ variant: "destructive", title: "World App Required", description: "Open this app inside the World App to connect your World Wallet and pay in WLD." });
      return;
    }
    try {
      const browserProvider = new BrowserProvider(worldAppProvider);
      const accounts = (await browserProvider.send("eth_requestAccounts", [])) as string[];
      if (accounts.length > 0) {
        const newAddress = accounts[0];
        const { ok, inUse } = await linkWalletToAccount(newAddress);
        if (!ok) {
          toast({ variant: "destructive", title: inUse ? "Wallet In Use" : "Wallet Connection Failed", description: inUse ? "This wallet address is already linked to another account." : "Could not link the wallet to your profile. Please try again." });
          return;
        }
        setWalletAddress(newAddress);
        setProvider(browserProvider);
        toast({ title: "Wallet Connected & Saved", description: `Address ${newAddress.slice(0,6)}...${newAddress.slice(-4)} is now linked to your profile.` });
      }
    } catch (error) {
      console.error("Error connecting via World App:", error);
      toast({ variant: "destructive", title: "Wallet Connection Failed", description: "Could not connect to the World App wallet. Please try again." });
    }
  }

  return (
    <WalletContext.Provider value={{
      walletAddress,
      provider,
      isConnected: !!walletAddress && !!provider,
      connectWallet,
      disconnectWallet
    }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = (): IWalletContext => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};
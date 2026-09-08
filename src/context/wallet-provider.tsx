// src/context/wallet-provider.tsx
"use client";

import { createContext, useState, useContext, ReactNode, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { BrowserProvider, Eip1193Provider } from "ethers";
import { useToast } from "@/hooks/use-toast";
import { auth, database } from "@/lib/firebase-config";
import { ref, update, query, orderByChild, equalTo, get } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { appkitEnabled } from "@/context/appkit";
import type { AppKitBridgeState, AppKitBridgeActions } from "./appkit-bridge";

const AppKitBridge = dynamic(
  () => import("./appkit-bridge").then((m) => m.AppKitBridge),
  { ssr: false }
);

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
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const { toast } = useToast();
  const { settings } = usePlatformSettings();

  const [appkitState, setAppkitState] = useState<AppKitBridgeState>({
    isConnected: false,
    address: null,
    walletProvider: null,
    caipNetworkId: null,
  });
  const appkitConnectedRef = useRef(false);
  const handleAppkitState = useCallback((state: AppKitBridgeState) => setAppkitState(state), []);

  const appkitOpenRef = useRef<(() => void) | null>(null);
  const appkitDisconnectRef = useRef<(() => Promise<void>) | null>(null);
  const appkitSwitchNetworkRef = useRef<((name: string) => Promise<void>) | null>(null);
  const handleAppkitActions = useCallback((actions: AppKitBridgeActions) => {
    appkitOpenRef.current = actions.open;
    appkitDisconnectRef.current = actions.disconnect;
    appkitSwitchNetworkRef.current = actions.switchNetworkByName;
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
    if (appkitEnabled) {
        appkitDisconnectRef.current?.();
    }
    console.log("Wallet disconnected.");
  }, [toast]);

  const connectWallet = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        toast({ variant: "destructive", title: "Not Logged In", description: "You must be logged in to connect a wallet." });
        return;
    }

    if (appkitEnabled) {
        if (!appkitOpenRef.current) {
            toast({ variant: "destructive", title: "Wallet Browser Starting", description: "Please wait a moment and try again." });
            return;
        }
        appkitOpenRef.current();
        return;
    }

    if (!window.ethereum) {
      toast({
        variant: "destructive",
        title: "MetaMask Not Found",
        description: "Please install the MetaMask extension to connect your wallet.",
      });
      return;
    }
    const injectedProvider = window.ethereum as unknown as InjectedEip1193Provider;

    const network = settings?.network || 'amoy';
    const targetChain = chainParams[network];

    try {
      await injectedProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChain.chainId }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await injectedProvider.request({
            method: 'wallet_addEthereumChain',
            params: [targetChain],
          });
        } catch (addError) {
          console.error("Failed to add the chain:", addError);
          toast({ variant: 'destructive', title: 'Network Error', description: `Could not add the ${targetChain.chainName} network to your wallet.`});
          return;
        }
      } else {
        console.error("Failed to switch the chain:", switchError);
        toast({ variant: 'destructive', title: 'Network Error', description: `Could not switch to the ${targetChain.chainName} network. Please do it manually in MetaMask.`});
        return;
      }
    }

    try {
        const browserProvider = new BrowserProvider(injectedProvider);
        const accounts = await browserProvider.send("eth_requestAccounts", []);

        if (accounts.length > 0) {
            const newAddress = accounts[0];
            const { ok, inUse } = await linkWalletToAccount(newAddress);

            if (!ok) {
                toast({
                    variant: "destructive",
                    title: inUse ? "Wallet In Use" : "Wallet Connection Failed",
                    description: inUse ? "This wallet address is already linked to another account." : "Could not link the wallet to your profile. Please try again.",
                });
                return;
            }

            setWalletAddress(newAddress);
            setProvider(browserProvider);

            toast({
                title: "Wallet Connected & Saved",
                description: `Address ${newAddress.slice(0,6)}...${newAddress.slice(-4)} is now linked to your profile.`,
            });
        }
    } catch (error) {
        console.error("Error connecting/syncing wallet:", error);
        toast({
            variant: "destructive",
            title: "Wallet Connection Failed",
            description: "Could not connect to the wallet. Please try again.",
        });
    }
  }

  useEffect(() => {
    if (!appkitEnabled) return;

    const wasConnected = appkitConnectedRef.current;
    appkitConnectedRef.current = appkitState.isConnected;

    if (!appkitState.isConnected || !appkitState.address || !appkitState.walletProvider) {
        if (wasConnected && walletAddress) {
            setWalletAddress(null);
            setProvider(null);
        }
        return;
    }

    const nextAddress = appkitState.address;
    const nextProvider = appkitState.walletProvider;

    if (walletAddress && walletAddress.toLowerCase() === nextAddress.toLowerCase()) {
        return;
    }

    linkWalletToAccount(nextAddress)
      .then(({ ok, inUse }) => {
        if (!ok) {
            toast({
                variant: "destructive",
                title: inUse ? "Wallet In Use" : "Wallet Connection Failed",
                description: inUse ? "This wallet address is already linked to another account." : "Could not link the wallet to your profile. Please try again.",
            });
            appkitDisconnectRef.current?.();
            setWalletAddress(null);
            setProvider(null);
            return;
        }
        setWalletAddress(nextAddress);
        setProvider(new BrowserProvider(nextProvider));

        const networkName = settings?.network || 'amoy';
        appkitSwitchNetworkRef.current?.(networkName).catch(() => {});

        if (!wasConnected) {
            toast({
                title: "Wallet Connected & Saved",
                description: `Address ${nextAddress.slice(0,6)}...${nextAddress.slice(-4)} is now linked to your profile.`,
            });
        }
      })
      .catch((error) => {
        console.error("Error syncing AppKit wallet:", error);
        toast({
            variant: "destructive",
            title: "Wallet Connection Failed",
            description: "Could not connect to the wallet. Please try again.",
        });
      });
  }, [appkitState, walletAddress, settings, toast]);

  const handleAccountsChanged = useCallback((accounts: string[]) => {
    if (walletAddress) {
        if (accounts.length === 0) {
            toast({ title: "Wallet Disconnected", description: "Your wallet has been disconnected from the site."});
            setWalletAddress(null);
            setProvider(null);
        } else if (accounts[0].toLowerCase() !== walletAddress.toLowerCase()) {
            toast({ title: "Wallet Account Changed", description: "Your active wallet account has changed. Please reconnect if you wish."});
            setWalletAddress(null);
            setProvider(null);
        }
    }
  }, [walletAddress, toast]);

  useEffect(() => {
    if (appkitEnabled) return;

    const checkConnection = async () => {
        const user = auth.currentUser;
        if (user && settings && window.ethereum) {
            const injectedProvider = window.ethereum as unknown as InjectedEip1193Provider;
            const userRef = ref(database, `users/${user.uid}`);
            const snapshot = await get(userRef);
            if (snapshot.exists() && snapshot.val().walletAddress) {
                const savedAddress = snapshot.val().walletAddress;

                try {
                    const provider = new BrowserProvider(injectedProvider);
                    const network = await provider.getNetwork();
                    const accounts = await provider.listAccounts();

                    const targetChainId = parseInt(chainParams[settings.network].chainId, 16);

                    if (accounts.length > 0 && accounts[0].address.toLowerCase() === savedAddress.toLowerCase() && network.chainId === BigInt(targetChainId)) {
                        setWalletAddress(savedAddress);
                        setProvider(provider);
                    } else {
                        setWalletAddress(null);
                        setProvider(null);
                    }
                } catch (e) {
                     setWalletAddress(null);
                     setProvider(null);
                }
            }
        }
    };

    checkConnection();

    const unsubscribeAuth = onAuthStateChanged(auth, checkConnection);

    const handleChainChanged = () => {
      window.location.reload();
    };

    if(window.ethereum) {
        const injectedProvider = window.ethereum as unknown as InjectedEip1193Provider;
        injectedProvider.on('chainChanged', handleChainChanged);
        injectedProvider.on('accountsChanged', (accounts) => handleAccountsChanged(accounts as string[]));
    }

    return () => {
        unsubscribeAuth();
        if(window.ethereum) {
            const injectedProvider = window.ethereum as unknown as InjectedEip1193Provider;
            injectedProvider.removeListener('chainChanged', handleChainChanged);
            injectedProvider.removeListener('accountsChanged', (accounts) => handleAccountsChanged(accounts as string[]));
        }
    }
  }, [settings, handleAccountsChanged]);

  return (
    <WalletContext.Provider 
      value={{ 
        connectWallet, 
        disconnectWallet, 
        walletAddress, 
        provider,
        isConnected: !!walletAddress && !!provider
      }}
    >
      {appkitEnabled && <AppKitBridge onState={handleAppkitState} onActions={handleAppkitActions} />}
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
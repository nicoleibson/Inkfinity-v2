// src/components/payment/payment-form.tsx
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, database } from '@/lib/firebase-config';
import { onAuthStateChanged } from 'firebase/auth';
import type { UserProfile, Notification } from '@/types/user';
import type { Referral } from '@/types/referral';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { NETWORK_TOKEN_SYMBOL } from '@/lib/blockchain';
import { useWallet } from '@/context/wallet-provider';
import { ref, get, update, serverTimestamp, push, increment } from 'firebase/database';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Wallet, ShieldCheck, Gem, Tag, CheckCircle } from 'lucide-react';
import { parseEther, parseUnits } from 'ethers';
import { isInWorldApp, sendWorldAppTransaction } from '@/lib/world-app';
import { verifyWithPolling } from '@/lib/payment-verification-client';
import { add } from 'date-fns';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const PLATFORM_WALLET_ADDRESS = process.env.NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS;

export default function PaymentForm() {
    const router = useRouter();
    const { toast } = useToast();
    const { settings, loading: loadingSettings } = usePlatformSettings();
    const { walletAddress, connectWallet, provider, isConnected } = useWallet();
    // Inside World App the transaction settles on World Chain (native WLD).
    const networkName = isInWorldApp() ? 'worldchain' : settings?.network;
    const tokenSymbol = NETWORK_TOKEN_SYMBOL[networkName as keyof typeof NETWORK_TOKEN_SYMBOL] ?? 'WLD';
    
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loadingUser, setLoadingUser] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [referralCode, setReferralCode] = useState('');
    const [referral, setReferral] = useState<Referral | null>(null);
    const [discountApplied, setDiscountApplied] = useState(false);
    const [verifyingCode, setVerifyingCode] = useState(false);
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const userRef = ref(database, `users/${firebaseUser.uid}`);
                const snapshot = await get(userRef);
                if (snapshot.exists()) {
                    const profile = { uid: firebaseUser.uid, ...snapshot.val() };
                    setUser(profile);
                     if (profile.status !== 'pending_payment') {
                        router.push('/'); // Redirect if they don't need to be here
                    }
                }
            } else {
                router.push('/login');
            }
            setLoadingUser(false);
        });
        return () => unsubscribe();
    }, [router]);

     const handleVerifyCode = async () => {
        if (!referralCode.trim()) return;
        setVerifyingCode(true);

        if (user?.referralCodeUsed) {
            toast({ variant: "destructive", title: "Code Already Used", description: "You have already redeemed a referral discount." });
            setVerifyingCode(false);
            return;
        }

        const referralRef = ref(database, `referrals/${referralCode.trim()}`);
        const snapshot = await get(referralRef);
        if (snapshot.exists()) {
            setReferral(snapshot.val());
            setDiscountApplied(true);
            toast({ title: "Referral Applied!", description: "Your discount has been applied." });
        } else {
            toast({ variant: "destructive", title: "Invalid Code", description: "The referral code you entered is not valid." });
            setReferral(null);
            setDiscountApplied(false);
        }
        setVerifyingCode(false);
    };

    
    const getPaymentDetails = () => {
        if (!settings || !user) return { fee: 0, originalFee: 0, discount: 0, title: 'Registration Fee', description: 'Complete the final step...' };
        
        let baseFee = 0;
        let title = 'Registration Fee';
        let description = 'Complete the final step...';

        if (user.role === 'Studio') {
            baseFee = settings.studioRegistrationFee || 0;
            title = 'Activate Your Studio Account';
            description = 'Complete the one-time registration fee for your Studio account.';
        }
        if (user.role === 'Supply Store') {
            baseFee = settings.supplyStoreRegistrationFee || 0;
            title = 'Activate Your Store Account';
            description = 'Complete the one-time registration fee for your Supply Store account.';
        }
        if (user.role === 'Tattoo Artist') {
            baseFee = settings.artistMembershipTiers?.tier1 || 0;
            title = 'Renew Your Membership';
            description = 'Your trial has ended. Renew your annual membership to continue.';
        }

        const discount = discountApplied && referral ? baseFee * (referral.discountPercentage / 100) : 0;
        const finalFee = baseFee - discount;

        return { fee: finalFee, originalFee: baseFee, discount, title, description };
    };
    
    const handlePayment = async () => {
        if (!user || !provider || !isConnected) {
            toast({ variant: 'destructive', title: "Wallet Not Ready", description: "Please connect your wallet." });
            return;
        }

        const { fee } = getPaymentDetails();
        if (fee <= 0 && getPaymentDetails().originalFee > 0) { // Allow free passage if final fee is 0 due to discount
             // Proceed without blockchain transaction
        } else if (fee <= 0) {
            toast({ variant: 'destructive', title: "Configuration Error", description: "Registration fee is not set." });
            return;
        }
        
        if (!PLATFORM_WALLET_ADDRESS) {
             toast({ variant: 'destructive', title: "Platform Wallet Not Set", description: "The platform's treasury wallet has not been configured." });
             return;
        }

        setIsProcessing(true);

        try {
            let txHash: string | null = null;
            let userOpHash: string | null = null;
                if (fee > 0) {
                if (isInWorldApp()) {
                    const userOp = await sendWorldAppTransaction({
                        to: PLATFORM_WALLET_ADDRESS as string,
                        valueWei: parseEther(fee.toFixed(18)),
                    });
                    userOpHash = userOp.userOpHash;
                    toast({ title: "Transaction Sent", description: "Waiting for blockchain confirmation..." });
                } else {
                const signer = await provider.getSigner(walletAddress ?? undefined);
                
                const txParams: { to: string, value: bigint, maxPriorityFeePerGas?: bigint, maxFeePerGas?: bigint } = {
                    to: PLATFORM_WALLET_ADDRESS,
                    value: parseEther(fee.toFixed(18))
                };
        
                if (settings?.network === 'amoy') {
                    const gasFee = parseUnits('30', 'gwei');
                    txParams.maxPriorityFeePerGas = gasFee;
                    txParams.maxFeePerGas = gasFee;
                }

                const tx = await signer.sendTransaction(txParams);
                txHash = tx.hash;

                toast({ title: "Transaction Sent", description: "Waiting for blockchain confirmation..." });
                await tx.wait();
                }
            }

            // Membership activation is done SERVER-SIDE at /api/verify-payment.
            // The client no longer writes status/paymentDate/trialEndsAt/referral
            // fields directly (RTDB rules block those writes for non-admins and
            // the server re-verifies the payment on-chain before activating).
            // `verifyWithPolling` retries while the endpoint answers 202, so a
            // userOperation that is still pending no longer surfaces as a failure.
            await verifyWithPolling(
                '/api/verify-payment',
                {
                    userId: user.uid,
                    txHash: txHash,
                    userOpHash: userOpHash,
                    network: networkName || 'worldchain',
                    // A fully discounted fee has no transaction to verify; the server
                    // re-derives the fee itself and decides whether this is legitimate.
                    freePassage: fee <= 0,
                },
                {
                    onPending: () =>
                        toast({ title: 'Confirming on-chain', description: 'Waiting for the transaction to be included in a block...' }),
                },
            );
            
            let successMessage = 'Your account is now active. Welcome to Inkfinity!';
            if(user.role === 'Tattoo Artist') {
                successMessage = 'Your membership has been renewed for another year!';
            }
            
            toast({ 
                title: "Payment Confirmed!",
                description: successMessage,
                className: "bg-green-500 text-white"
            });
            
            router.push('/');

        } catch (error: any) {
            console.error("Payment failed:", error);
            if (error.code === 'INSUFFICIENT_FUNDS') {
                toast({ variant: 'destructive', title: 'Insufficient Funds', description: `You do not have enough ${tokenSymbol} in your wallet to complete this transaction.` });
            } else if (error.code === 'CALL_EXCEPTION') {
                 toast({ variant: 'destructive', title: 'Transaction Failed', description: 'The transaction is likely to fail. Please check your wallet balance and network, then try again.' });
            } else if (error.code === 'TX_PENDING') {
                 // The transfer went through but has not been confirmed yet. Say so
                 // explicitly: the money left the wallet, so this is not a failure.
                 toast({ variant: 'destructive', title: 'Still Confirming', description: 'Your payment was sent and is waiting for on-chain confirmation. It will be applied automatically once confirmed — do not pay again.' });
            } else if (error.code === 'PAYMENT_ALREADY_USED') {
                 toast({ variant: 'destructive', title: 'Payment Already Used', description: 'This payment has already been applied to your account.' });
            } else if (error.code === 'NO_FEE_DUE') {
                 toast({ variant: 'destructive', title: 'Nothing To Pay', description: 'No membership fee is due for your account.' });
            } else {
                 toast({ variant: 'destructive', title: 'Payment Failed', description: error?.message || error?.reason || 'An unknown error occurred.' });
            }
        } finally {
            setIsProcessing(false);
        }
    };
    
    const { fee, originalFee, discount, title, description } = getPaymentDetails();

    if (loadingUser || loadingSettings) {
          const tokenSymbol = NETWORK_TOKEN_SYMBOL[settings?.network as keyof typeof NETWORK_TOKEN_SYMBOL] ?? NETWORK_TOKEN_SYMBOL['worldchain'];
return (
            <Card className="w-full max-w-md">
                <CardHeader>
                    <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                </CardHeader>
            </Card>
        )
    }
    
    return (
        <Card className="w-full max-w-md border-primary/20">
            <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                    {user?.role === 'Tattoo Artist' ? <Gem className="h-12 w-12 text-primary" /> : <ShieldCheck className="h-12 w-12 text-primary" /> }
                </div>
                <CardTitle className="font-headline text-2xl">{title}</CardTitle>
                <CardDescription>
                   {description}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="referralCode">Referral Code (Optional)</Label>
                    <div className="flex gap-2">
                        <Input
                            id="referralCode"
                            placeholder="Enter code for a discount"
                            value={referralCode}
                            onChange={(e) => setReferralCode(e.target.value)}
                            disabled={discountApplied || user?.referralCodeUsed}
                        />
                        <Button onClick={handleVerifyCode} disabled={!referralCode || verifyingCode || discountApplied || user?.referralCodeUsed}>
                            {verifyingCode ? <Loader2 className="h-4 w-4 animate-spin"/> : "Apply"}
                        </Button>
                    </div>
                    {user?.referralCodeUsed && (
                        <p className="text-xs text-muted-foreground">You have already used a referral code.</p>
                    )}
                </div>

                <div className="text-center p-6 bg-card rounded-lg border border-border">
                    {discount > 0 && (
                        <p className="text-sm text-muted-foreground line-through">${originalFee.toFixed(2)}</p>
                    )}
                    <p className="text-4xl font-bold text-primary">{fee.toFixed(4)} {tokenSymbol}</p>
                     {discount > 0 && (
                        <p className="text-sm text-green-500 font-semibold flex items-center justify-center gap-1">
                            <CheckCircle className="h-4 w-4"/>
                            {referral?.discountPercentage}% discount applied!
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground">(on {settings?.network} network)</p>
                </div>
                <div className="text-center">
                    {isConnected ? (
                        <p className="text-sm text-green-500">Wallet Connected: {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</p>
                    ) : (
                         <p className="text-sm text-amber-500">Please connect your wallet to proceed.</p>
                    )}
                </div>
            </CardContent>
            <CardFooter>
                {isConnected ? (
                    <Button className="w-full" size="lg" onClick={handlePayment} disabled={isProcessing || !PLATFORM_WALLET_ADDRESS}>
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Wallet className="mr-2 h-4 w-4"/>}
                        {isProcessing ? 'Processing Payment...' : `Pay ${fee.toFixed(4)} ${tokenSymbol} Now`}
                    </Button>
                ) : (
                    <Button className="w-full" size="lg" onClick={connectWallet}>
                        <Wallet className="mr-2 h-4 w-4"/>
                        Connect Wallet
                    </Button>
                )}
            </CardFooter>
        </Card>
    )
}

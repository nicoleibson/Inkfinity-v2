// src/app/rewards/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gem, Trophy, Star, ShieldAlert, Loader2 } from "lucide-react";
import { auth, database } from "@/lib/firebase-config";
import { onAuthStateChanged } from "firebase/auth";
import { get, ref, runTransaction, onValue } from "firebase/database";
import type { UserProfile } from "@/types/user";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

type Reward = {
  id: "feature_slot" | "digital_listings" | "pro_badge";
  title: string;
  points: number;
  description: string;
  icon: React.ElementType;
};

const rewards: Reward[] = [
  {
    id: "feature_slot",
    title: "Artwork Feature Slot",
    points: 500,
    description: "Get your artwork featured on the homepage for 24 hours.",
    icon: Star,
  },
  {
    id: "digital_listings",
    title: "10 Digital Asset Listings",
    points: 1000,
    description: "List 10 of your artworks as digital assets for sale.",
    icon: Gem,
  },
  {
    id: "pro_badge",
    title: "Pro Artist Badge",
    points: 5000,
    description: "A permanent 'Pro' badge displayed on your profile.",
    icon: Trophy,
  },
];

export default function RewardsPage() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingRewardId, setClaimingRewardId] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDbRef = ref(database, `users/${user.uid}`);
        const unsubscribeDb = onValue(userDbRef, (snapshot) => {
            if (snapshot.exists()) {
              const profile = snapshot.val();
              setUserProfile({ uid: user.uid, ...profile });
              if (['Administrator', 'Super-Administrator'].includes(profile.role)) {
                toast({
                  variant: 'destructive',
                  title: 'Access Denied',
                  description: 'You do not have access to the rewards page.'
                });
                router.push('/');
                return;
              }
            }
             setLoading(false);
        });

        return () => unsubscribeDb();
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router, toast]);

  const handleRedeem = async (reward: Reward) => {
    if (!userProfile || !userProfile.uid) return;

    setClaimingRewardId(reward.id);

    if ((userProfile.points || 0) < reward.points) {
      toast({ variant: "destructive", title: "Not Enough Points" });
      setClaimingRewardId(null);
      return;
    }
    
    if (userProfile.claimedRewards && userProfile.claimedRewards[reward.id]) {
      toast({ variant: "destructive", title: "Reward Already Claimed" });
      setClaimingRewardId(null);
      return;
    }

    const userRef = ref(database, `users/${userProfile.uid}`);

    try {
      await runTransaction(userRef, (currentProfile) => {
        if (currentProfile) {
          if ((currentProfile.points || 0) >= reward.points) {
            currentProfile.points -= reward.points;
            if (!currentProfile.claimedRewards) {
              currentProfile.claimedRewards = {};
            }
            currentProfile.claimedRewards[reward.id] = true;
          }
        }
        return currentProfile;
      });
      toast({ title: "Reward Claimed!", description: `You have successfully redeemed "${reward.title}".` });
    } catch (error) {
      console.error("Redeem failed:", error);
      toast({ variant: "destructive", title: "An error occurred." });
    } finally {
      setClaimingRewardId(null);
    }
  };


  const isAdmin = ['Administrator', 'Super-Administrator'].includes(userProfile?.role || '');

  if (loading) {
      return (
        <div className="space-y-8">
            <div className="text-center p-8 bg-card rounded-lg border border-primary/20 shadow-lg shadow-primary/10">
                <Skeleton className="h-10 w-3/4 mx-auto mb-2" />
                <Skeleton className="h-6 w-1/2 mx-auto" />
                <div className="mt-6">
                    <Card className="inline-block bg-background/50">
                        <CardContent className="p-4">
                            <Skeleton className="h-4 w-24 mb-2" />
                            <Skeleton className="h-8 w-32" />
                        </CardContent>
                    </Card>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        </div>
      )
  }

  if (isAdmin) {
    return (
        <div className="flex flex-col items-center justify-center h-96 text-center">
            <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
            <h1 className="text-2xl font-bold">Access Denied</h1>
            <p className="text-muted-foreground">This page is not available for your account type.</p>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center p-8 bg-card rounded-lg border border-primary/20 shadow-lg shadow-primary/10">
        <h1 className="text-4xl font-headline font-bold text-primary">Points & Rewards</h1>
        <p className="text-muted-foreground mt-2">Redeem your hard-earned points for exclusive prizes.</p>
        <div className="mt-6">
            <Card className="inline-block bg-background/50">
                <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Your Points Balance</p>
                    <p className="text-3xl font-bold text-primary flex items-center justify-center gap-2">
                        <Gem className="h-6 w-6"/>
                        {(userProfile?.points || 0).toLocaleString()}
                    </p>
                </CardContent>
            </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rewards.map((reward) => {
          const isClaimed = !!userProfile?.claimedRewards?.[reward.id];
          const canAfford = (userProfile?.points || 0) >= reward.points;
          const isClaiming = claimingRewardId === reward.id;
          const isDisabled = isClaimed || !canAfford || isClaiming;

          const getButtonText = () => {
            if (isClaiming) return 'Claiming...';
            if (isClaimed) return 'Claimed';
            if (!canAfford) return 'Not Enough Points';
            return 'Redeem';
          };
          
          return (
            <Card key={reward.id} className="flex flex-col">
                <CardHeader className="flex-row items-center gap-4">
                <reward.icon className="w-10 h-10 text-primary" />
                <div>
                    <CardTitle className="font-headline">{reward.title}</CardTitle>
                    <CardDescription className="text-primary font-bold flex items-center gap-1">
                    <Gem className="w-4 h-4"/>{reward.points.toLocaleString()} Points
                    </CardDescription>
                </div>
                </CardHeader>
                <CardContent className="flex-grow">
                <p className="text-muted-foreground">{reward.description}</p>
                </CardContent>
                <CardFooter>
                <Button className="w-full" disabled={isDisabled} onClick={() => handleRedeem(reward)}>
                    {isClaiming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {getButtonText()}
                </Button>
                </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}


// src/app/admin/referrals/page.tsx
"use client";

import { useEffect, useState } from "react";
import { auth, database } from "@/lib/firebase-config";
import { onAuthStateChanged } from "firebase/auth";
import { ref, query, orderByChild, equalTo, get } from "firebase/database";
import type { UserProfile } from "@/types/user";
import type { Referral } from "@/types/referral";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ClipboardCopy, ClipboardCheck, Gift, Users, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

import { ReferralStatsCards } from "@/components/referrals/referral-stats-cards";
import { ReferralEarningsChart } from "@/components/referrals/referral-earnings-chart";
import { ReferralPayoutsTable } from "@/components/referrals/referral-payouts-table";

export default function MyReferralsPage() {
    const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
    const [referralCode, setReferralCode] = useState<string | null>(null);
    const [referralData, setReferralData] = useState<Referral | null>(null);
    const [referredUsers, setReferredUsers] = useState<UserProfile[]>([]);
    const [earnings, setEarnings] = useState<Record<string, any>>({});
    const [payouts, setPayouts] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [accessDenied, setAccessDenied] = useState(false);
    const [copied, setCopied] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                const userRef = ref(database, `users/${user.uid}`);
                get(userRef).then((snapshot) => {
                    if (snapshot.exists()) {
                        const profile: UserProfile = { uid: user.uid, ...snapshot.val() };
                        if (profile.role !== 'Administrator' && profile.role !== 'Super-Administrator') {
                            setAccessDenied(true);
                            setLoading(false);
                            router.push('/');
                        } else {
                            setCurrentUser(profile);
                            fetchReferralData(user.uid);
                        }
                    } else {
                        setAccessDenied(true);
                        setLoading(false);
                    }
                });
            } else {
                setAccessDenied(true);
                setLoading(false);
                router.push('/login');
            }
        });
        return () => unsubscribe();
    }, [router]);

    const fetchReferralData = async (adminId: string) => {
        setLoading(true);
        try {
            // Fetch the admin's referral code
            const referralsRef = query(ref(database, 'referrals'), orderByChild('referrerId'), equalTo(adminId));
            const referralSnapshot = await get(referralsRef);
            if (referralSnapshot.exists()) {
                referralSnapshot.forEach(child => {
                    const rData: Referral = child.val();
                    setReferralCode(rData.code);
                    setReferralData(rData);
                });
            }

            // Fetch users referred by this admin
            const usersRef = query(ref(database, 'users'), orderByChild('referredBy'), equalTo(adminId));
            const usersSnapshot = await get(usersRef);
            if (usersSnapshot.exists()) {
                const usersData: UserProfile[] = [];
                usersSnapshot.forEach(child => {
                    usersData.push({ uid: child.key, ...child.val() });
                });
                setReferredUsers(usersData);
            }

            // Fetch earnings data
            const earningsRef = ref(database, `users/${adminId}/referralEarnings`);
            const earningsSnapshot = await get(earningsRef);
            if (earningsSnapshot.exists()) {
                setEarnings(earningsSnapshot.val());
            }

            // Fetch payouts data
            const payoutsRef = ref(database, `users/${adminId}/referralPayouts`);
            const payoutsSnapshot = await get(payoutsRef);
            if (payoutsSnapshot.exists()) {
                setPayouts(payoutsSnapshot.val());
            }
        } catch (error) {
            console.error("Failed to fetch referral data:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not fetch referral data." });
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (referralCode) {
            navigator.clipboard.writeText(referralCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast({ title: "Copied!", description: "Referral code copied to clipboard." });
        }
    };

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (accessDenied) {
       return (
        <div className="flex flex-col items-center justify-center h-96 text-center">
            <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
            <h1 className="text-2xl font-bold">Access Denied</h1>
            <p className="text-muted-foreground">This page is not available for your role.</p>
        </div>
       );
    }

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-headline font-bold">My Referrals</h1>

            {/* Stats Cards */}
            <ReferralStatsCards totalReferrals={referredUsers.length} earnings={earnings} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <Card>
                        <CardHeader>
                            <CardTitle className="font-headline flex items-center gap-2"><Gift /> Your Referral Code</CardTitle>
                            <CardDescription>Share this code with new users to get rewards when they sign up.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {referralCode ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3 bg-muted rounded-md border">
                                        <span className="font-mono text-lg text-primary">{referralCode}</span>
                                        <Button size="icon" variant="ghost" onClick={copyToClipboard}>
                                            {copied ? <ClipboardCheck className="h-5 w-5 text-green-500"/> : <ClipboardCopy className="h-5 w-5"/>}
                                        </Button>
                                    </div>
                                    {referralData && (
                                        <div className="text-xs text-muted-foreground space-y-1">
                                            <p>Discount for new users: <span className="font-semibold text-foreground">{referralData.discountPercentage}%</span></p>
                                            <p>Your commission: <span className="font-semibold text-foreground">{referralData.commissionPercentage}%</span></p>
                                            <p>Times used: <span className="font-semibold text-foreground">{referralData.uses || 0}</span></p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-center py-4">Your Super-Administrator has not generated a code for you yet.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
                <div className="lg:col-span-2">
                    <ReferralEarningsChart earnings={earnings} />
                </div>
            </div>

            {/* Payouts Table */}
            <ReferralPayoutsTable earnings={earnings} payouts={payouts} />

            <div>
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2"><Users /> Referred Users</CardTitle>
                        <CardDescription>Users who have registered and paid using your code.</CardDescription>
                    </CardHeader>
                    <CardContent>
                       {referredUsers.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Registration Date</TableHead>
                                        <TableHead>Payment Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {referredUsers.map(user => (
                                        <TableRow key={user.uid}>
                                            <TableCell>{user.name}</TableCell>
                                            <TableCell>{user.role}</TableCell>
                                            <TableCell>{user.creationTime ? format(new Date(user.creationTime), 'PPP') : 'N/A'}</TableCell>
                                            <TableCell>{user.paymentDate ? format(new Date(user.paymentDate), 'PPP') : 'N/A'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                       ) : (
                           <p className="text-muted-foreground text-center py-8">No users have signed up with your code yet.</p>
                       )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

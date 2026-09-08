// src/app/admin/users/user-management-table.tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { database, auth } from "@/lib/firebase-config";
import { ref, onValue, query, orderByChild, update, get, set, equalTo } from "firebase/database";
import type { UserProfile } from "@/types/user";
import type { Referral } from "@/types/referral";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2, Gift, Edit, Info } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { UserRoleControl } from "@/components/admin/user-role-control";
import { UserStatusControl } from "@/components/admin/user-status-control";
import { ReferralEditDialog } from "@/components/admin/referral-edit-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserMembershipControl } from "@/components/admin/user-membership-control";

type UserWithUid = UserProfile & { uid: string; referral?: Referral };

const requestStatusConfig: Record<NonNullable<UserProfile['artistRequestStatus']>, { label: string; color?: string; }> = {
    none: { label: 'None' },
    pending: { label: 'Pending', color: 'text-amber-500' },
    approved: { label: 'Approved', color: 'text-green-500' },
    rejected: { label: 'Rejected', color: 'text-red-500' },
};

export default function UserManagementTable() {
  const [users, setUsers] = useState<UserWithUid[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [generatingCodeFor, setGeneratingCodeFor] = useState<string | null>(null);
  const [editingReferral, setEditingReferral] = useState<Referral | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);

  const fetchAllData = useCallback(async () => {
    if (!currentUserProfile) return;
    setLoading(true);

    try {
        const usersQuery = query(ref(database, 'users'), orderByChild('name'));
        const referralsQuery = query(ref(database, 'referrals'));

        const [usersSnapshot, referralsSnapshot] = await Promise.all([
            get(usersQuery),
            get(referralsQuery)
        ]);

        if (!usersSnapshot.exists()) {
            setUsers([]);
            setError("No users found.");
            setLoading(false);
            return;
        }
        
        const usersData: UserWithUid[] = [];
        usersSnapshot.forEach(childSnapshot => {
            usersData.push({ uid: childSnapshot.key as string, ...childSnapshot.val() });
        });
        
        const referralMap: { [adminId: string]: Referral } = {};
        if (referralsSnapshot.exists()) {
            referralsSnapshot.forEach(child => {
                const referral = child.val() as Referral;
                referralMap[referral.referrerId] = referral;
            });
        }
        
        let filteredUsers = usersData;
        // Filter out other admins if the current user is an 'Administrator' but not a 'Super-Administrator'
        if (currentUserProfile.role === 'Administrator') {
            filteredUsers = usersData.filter(user => user.role !== 'Administrator' && user.role !== 'Super-Administrator');
        }

        const enrichedUsers = filteredUsers.map(user => ({
            ...user,
            referral: referralMap[user.uid]
        }));

        setUsers(enrichedUsers);
        setError(null);

    } catch (err: any) {
        console.error(err);
        setError("Permission denied or failed to fetch data.");
    } finally {
        setLoading(false);
    }
  }, [currentUserProfile]);


  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        get(userRef).then(snapshot => {
            if(snapshot.exists()) {
                setCurrentUserProfile({uid: user.uid, ...snapshot.val()});
            } else {
                 setError("Could not retrieve your user profile.");
                 setLoading(false);
            }
        });
      } else {
        setCurrentUserProfile(null);
        setError("You are not authorized to view this page.");
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Fetch data once the current user's profile is loaded
  useEffect(() => {
    if (currentUserProfile) {
      fetchAllData();
    }
  }, [currentUserProfile, fetchAllData]);


  const handleUpdateRequest = async (userId: string, decision: 'approved' | 'rejected') => {
    setUpdatingUserId(userId);
    const userRef = ref(database, `users/${userId}`);
    const updates: Partial<UserProfile> = {
        artistRequestStatus: decision,
    };
    if (decision === 'approved') {
        updates.role = 'Tattoo Artist';
    }

    try {
        await update(userRef, updates);
        toast({
            title: `Request ${decision}`,
            description: `The user's request has been successfully ${decision}.`,
        });
        await fetchAllData(); // Re-fetch data to reflect changes
    } catch (err: any) {
        toast({
            variant: 'destructive',
            title: 'Update failed',
            description: err.message || 'Could not update the user request.',
        });
    } finally {
        setUpdatingUserId(null);
    }
  };
  
   const handleGenerateCode = async (adminUser: UserWithUid) => {
    setGeneratingCodeFor(adminUser.uid);
    try {
        const newCode = `${adminUser.name.split(' ')[0].toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        
        const newReferral: Referral = {
            code: newCode,
            referrerId: adminUser.uid,
            adminName: adminUser.name,
            discountPercentage: 30,
            commissionPercentage: 20,
            createdAt: new Date().toISOString(),
            uses: 0,
        };

        await set(ref(database, `referrals/${newCode}`), newReferral);
        toast({ title: "Code Generated!", description: `New referral code created for ${adminUser.name}: ${newCode}` });
        await fetchAllData(); // Re-fetch data to reflect changes
    } catch (error) {
        console.error("Failed to generate code:", error);
        toast({ variant: 'destructive', title: 'Generation Failed' });
    } finally {
        setGeneratingCodeFor(null);
    }
  };
  
  if (error) {
    return <div className="text-destructive text-center p-8">{error}</div>;
  }

  if (loading || !currentUserProfile) {
      return (
         <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Artist Request</TableHead>
                <TableHead>Membership</TableHead>
                <TableHead>Referral Code</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                    <TableCell>
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                        </div>
                    </div>
                    </TableCell>
                    <TableCell><Skeleton className="h-9 w-[180px]" /></TableCell>
                    <TableCell><Skeleton className="h-9 w-[180px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                </TableRow>
                ))}
            </TableBody>
           </Table>
         </div>
      )
  }

  return (
    <>
      <ReferralEditDialog 
        referral={editingReferral}
        open={!!editingReferral}
        onOpenChange={(isOpen) => {
            if (!isOpen) setEditingReferral(null);
        }}
        onSuccess={fetchAllData}
      />
      <TooltipProvider>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Artist Request</TableHead>
                <TableHead>Membership</TableHead>
                <TableHead>Referral Code</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {users.map(user => {
                  const requestStatusInfo = requestStatusConfig[user.artistRequestStatus || 'none'];
                  const isProcessingRequest = updatingUserId === user.uid;
                  const isGeneratingCode = generatingCodeFor === user.uid;
                  const canGenerateCode = currentUserProfile.role === 'Super-Administrator' && user.role === 'Administrator';
                  const canViewCode = (currentUserProfile.role === 'Super-Administrator' || currentUserProfile.role === 'Administrator') && user.role === 'Administrator';
                  const canEditCode = currentUserProfile.role === 'Super-Administrator' && user.referral;

                  return (
                    <TableRow key={user.uid}>
                        <TableCell>
                        <div className="flex items-center gap-3">
                            <Avatar>
                            <AvatarImage src={user.avatarUrl} alt={user.name} />
                            <AvatarFallback>{user.name?.charAt(0) || 'U'}</AvatarFallback>
                            </Avatar>
                            <div>
                            <div className="font-medium">{user.name}</div>
                            <div className="text-sm text-muted-foreground">@{user.username}</div>
                            </div>
                        </div>
                        </TableCell>
                        <TableCell>
                            <UserRoleControl user={user} currentUserRole={currentUserProfile.role as UserProfile['role']} onSuccess={fetchAllData} />
                        </TableCell>
                        <TableCell>
                            <UserStatusControl user={user} currentUserRole={currentUserProfile.role as UserProfile['role']} onSuccess={fetchAllData}/>
                        </TableCell>
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <span className={cn('font-medium', requestStatusInfo?.color)}>{requestStatusInfo?.label}</span>
                                {user.artistRequestStatus === 'pending' ? (
                                    <div className="flex gap-1">
                                        <Button size="icon" className="h-6 w-6" variant="ghost" onClick={() => handleUpdateRequest(user.uid, 'approved')} disabled={isProcessingRequest}>
                                            {isProcessingRequest ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle className="h-4 w-4 text-green-500"/>}
                                        </Button>
                                        <Button size="icon" className="h-6 w-6" variant="ghost" onClick={() => handleUpdateRequest(user.uid, 'rejected')} disabled={isProcessingRequest}>
                                            <XCircle className="h-4 w-4 text-red-500"/>
                                        </Button>
                                    </div>
                                ) : (
                                   <Tooltip>
                                        <TooltipTrigger>
                                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Actions are only available for 'Pending' requests.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                            </div>
                        </TableCell>
                        <TableCell>
                            {currentUserProfile.role === 'Super-Administrator' && <UserMembershipControl user={user} onSuccess={fetchAllData} />}
                        </TableCell>
                        <TableCell>
                            {canViewCode && (
                                user.referral ? (
                                    <Button 
                                      variant="link" 
                                      className="font-mono text-sm p-0 h-auto"
                                      onClick={() => canEditCode && setEditingReferral(user.referral!)}
                                      disabled={!canEditCode}
                                    >
                                        {user.referral.code}
                                        {canEditCode && <Edit className="h-3 w-3 ml-2"/>}
                                    </Button>
                                ) : (
                                    canGenerateCode && (
                                        <Button size="sm" variant="outline" onClick={() => handleGenerateCode(user)} disabled={isGeneratingCode}>
                                            {isGeneratingCode ? <Loader2 className="animate-spin h-4 w-4"/> : <Gift className="h-4 w-4" />}
                                            <span className="ml-2">Generate Code</span>
                                        </Button>
                                    )
                                )
                            )}
                        </TableCell>
                    </TableRow>
                  )
                })
              }
            </TableBody>
          </Table>
        </div>
      </TooltipProvider>
    </>
  );
}

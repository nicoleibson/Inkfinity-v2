// src/lib/actions/user-actions.ts
'use server';

import { database } from '@/lib/firebase-config';
import { ref, get, update } from 'firebase/database';
import { add } from 'date-fns';
import type { UserProfile } from '@/types/user';

export async function grantGlobalMembership(): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    try {
        const usersRef = ref(database, 'users');
        const snapshot = await get(usersRef);

        if (!snapshot.exists()) {
            return { success: false, updatedCount: 0, error: 'No users found.' };
        }

        const updates: { [key: string]: any } = {};
        const oneYearFromNow = add(new Date(), { years: 1 }).toISOString();
        let updatedCount = 0;

        snapshot.forEach(childSnapshot => {
            const user = childSnapshot.val() as UserProfile;
            const userId = childSnapshot.key;
            
            // Grant membership to all paying roles
            if (userId && (user.role === 'Tattoo Artist' || user.role === 'Studio' || user.role === 'Supply Store')) {
                 // Set paymentDate to now, and trialEndsAt to one year from now.
                 updates[`/users/${userId}/paymentDate`] = new Date().toISOString();
                 updates[`/users/${userId}/trialEndsAt`] = oneYearFromNow;

                 // If they were pending payment, make them active.
                 if (user.status === 'pending_payment') {
                    updates[`/users/${userId}/status`] = 'active';
                 }
                 updatedCount++;
            }
        });

        if (Object.keys(updates).length > 0) {
            await update(ref(database), updates);
        }

        return { success: true, updatedCount };
    } catch (error: any) {
        console.error('Failed to grant global membership:', error);
        return { success: false, updatedCount: 0, error: error.message };
    }
}


export async function extendUserMembership(userId: string): Promise<{ success: boolean; error?: string }> {
    if (!userId) {
        return { success: false, error: 'User ID is required.' };
    }

    try {
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            return { success: false, error: 'User not found.' };
        }

        const user = snapshot.val() as UserProfile;

        // Only extend for paying roles
        if (!['Tattoo Artist', 'Studio', 'Supply Store'].includes(user.role)) {
            return { success: false, error: 'This user role does not have a membership to extend.' };
        }

        const oneYearFromNow = add(new Date(), { years: 1 });
        
        let newTrialEndsAt: Date;
        if (user.trialEndsAt && new Date(user.trialEndsAt) > new Date()) {
            // If membership is current, extend from the current expiry date
            newTrialEndsAt = add(new Date(user.trialEndsAt), { years: 1 });
        } else {
            // If expired or no membership, extend from today
            newTrialEndsAt = oneYearFromNow;
        }

        const updates: { [key: string]: any } = {
            [`/users/${userId}/trialEndsAt`]: newTrialEndsAt.toISOString(),
            [`/users/${userId}/status`]: 'active', // Ensure user is active
            [`/users/${userId}/paymentDate`]: new Date().toISOString(), // Mark a recent payment
        };
        
        await update(ref(database), updates);

        return { success: true };
    } catch (error: any) {
        console.error(`Failed to extend membership for user ${userId}:`, error);
        return { success: false, error: error.message };
    }
}
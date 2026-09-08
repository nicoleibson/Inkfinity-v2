// inkfinity-ml/src/triggers.ts
import { onValueCreated } from "firebase-functions/v2/database";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

const db = admin.database();

/**
 * Triggered when a user's payment is confirmed (when paymentDate is created).
 * If a referral code was used, this function rewards the referring administrator.
 */
export const onReferralPayment = onValueCreated("/users/{userId}/paymentDate", async (event) => {
    const userId = event.params.userId;
    
    const userRef = db.ref(`/users/${userId}`);

    try {
      const userSnapshot = await userRef.once("value");
      const userData = userSnapshot.val();

      // Check if a referral code was used and the user was referred
      if (!userData || !userData.referredBy || !userData.referralCodeUsed) {
        logger.log(`No referral to process for user ${userId}. Exiting.`);
        return;
      }

      const adminId = userData.referredBy;
      const userName = userData.name || "A new user";
      const adminRef = db.ref(`/users/${adminId}`);

      logger.log(`Processing referral for user ${userId}, rewarding admin ${adminId}.`);

      // 1. Use a transaction to safely update admin's points
      await adminRef.child("points").transaction((currentPoints) => {
        return (currentPoints || 0) + 1000;
      });

      // 2. Add a notification for the admin
      const notificationsRef = adminRef.child("notifications").push();
      await notificationsRef.set({
        type: "referral_credit",
        fromUserId: userId,
        fromUserName: userName,
        message: `You earned 1000 points! Your referral code was used by ${userName}.`,
        isRead: false,
        createdAt: admin.database.ServerValue.TIMESTAMP,
        link: "/admin/referrals",
      });
      
      // 3. To prevent this from ever re-triggering for the same payment,
      // we can flip the `referralCodeUsed` flag to a different state, like 'processed'.
      // This is good practice for idempotent functions.
      // However, since onValueCreated only runs once, this is less critical here.
      
      logger.log(`Successfully rewarded admin ${adminId} for referral by user ${userId}.`);
      return;

    } catch (error) {
      logger.error(`Failed to process referral for user ${userId}:`, error);
      return;
    }
  }
);

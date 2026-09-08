/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions/v2";
import * as admin from "firebase-admin";

// Initialize admin SDK
if (admin.apps.length === 0) {
    admin.initializeApp();
}

// Set global options for all functions
setGlobalOptions({ maxInstances: 10 });

// Export all triggers from the triggers file
export * from "./triggers";

// You can also export other functions like Genkit samples if needed
// export * from "./genkit-sample";

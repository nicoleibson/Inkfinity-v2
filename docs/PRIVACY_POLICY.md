# Privacy Policy — Inkfinity

**Effective Date:** October 25, 2026  
**Last Updated:** October 25, 2026

Inkfinity ("we", "our", or "the Platform") is committed to protecting your privacy. This Privacy Policy explains how information is collected, used, and safeguarded when you access Inkfinity via the World App MiniApp, web browser, or related services.

---

## 1. Core Privacy Philosophy: Data Minimization

Inkfinity is built around **privacy-preserving decentralized principles**. Whenever possible:
- We rely on zero-knowledge cryptography (World ID) to confirm human identity without collecting personal identifiers.
- We do not sell, rent, or trade your personal information.
- We collect only the minimum data required to facilitate appointments, artwork discovery, and peer-to-peer artist transactions.

---

## 2. Information We Collect

### A. World ID & Blockchain Authentication
- **Nullifier Hash:** When signing in with World ID, we receive a unique, pseudonymous nullifier specific to Inkfinity. We never receive or store your iris scans, passport numbers, government IDs, or private biometric templates.
- **World Chain Wallet Address:** If you execute transactions (e.g., booking deposits or artist memberships in WLD), your public World Chain address is processed on-chain.
- **World App Username:** We display your public World App username to identify your account cleanly without exposing raw cryptographic keys.

### B. User Profile & Studio Data (Voluntary)
- **Profile Details:** Display name, bio, social media links (Instagram, WhatsApp, Telegram), artistic style, and profile avatar.
- **Portfolios:** Images and artwork descriptions uploaded by artists to showcase their work.

### C. Optional Facial 2FA (Biometric Liveness Verification)
- If you voluntarily activate Two-Factor Authentication (2FA) with Facial Scan:
  - Face landmark analysis and liveness checks (blink and head orientation) occur in your local device browser using Google MediaPipe.
  - Verification comparison is performed server-side solely to confirm that the person logging in matches the registered account owner.
  - We do **not** use your images to train public AI models.
  - You can disable 2FA at any time from your account settings.

---

## 3. How We Use Your Information

- **Account Management:** To authenticate your identity and maintain your artist/client profile.
- **Booking & Scheduling:** To enable clients to request tattoo appointments with artists and studios.
- **Payment Verification:** To verify on-chain World Chain transactions for booking deposits and premium features.
- **Security & Integrity:** To prevent sybil attacks, bot abuse, replay attacks, and unauthorized access.

---

## 4. Third-Party Integrations & Decentralized Storage

- **World (World ID & MiniKit):** Identity verification proofs are verified via World's API. No personal biometric data is shared with Inkfinity.
- **Firebase (Google Cloud):** Used for real-time database synchronization and session management with strict server-side rules.
- **IPFS & User Cloud Storage:** Artwork files are stored on decentralized IPFS or the artist's connected cloud storage.

---

## 5. Data Retention & Deletion

- You have full ownership of your data.
- You can request complete deletion of your account and associated profile data at any time through the platform settings or by contacting our support team.
- Upon account deletion, all profile metadata, usernames, and 2FA credentials will be permanently purged from our database.

---

## 6. Children's Privacy

Inkfinity is not directed to individuals under the age of 18 (or the legal age of majority required to receive a tattoo in your local jurisdiction). We do not knowingly collect personal data from minors.

---

## 7. Contact Us & Support

If you have questions, feedback, or data privacy requests regarding this Privacy Policy or your account, please contact us:

- **Support & Privacy Email:** support@inkfinity.app
- **Official Portal:** [https://inkfinity-ten.vercel.app](https://inkfinity-ten.vercel.app)
- **Developer & Foundation Inquiries:** contact@inkfinity.app

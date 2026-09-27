# **App Name**: Inkfinity

## Core Features:

- Artwork Browsing & Filtering: A main gallery where users can browse all public artworks, with filtering by style and theme, and a search bar.
- User Profiles: Public profiles for artists and studios showcasing their bio, artworks, social links, location, and availability.
- Community Features: Users can follow and unfollow artists.
- User Profiles: Private profile page for logged-in users to manage their information, privacy settings, linked accounts, and availability.
- User Roles: Four main categories: Studios, Tattoo Artists, Clients, and Supply Stores, plus two administrative roles: Administrator and Super-Administrator.
- Advanced Search: A dedicated page to find artwork, artists, or studios by keywords, category, style, and location.
- Artwork Details Generation: AI tool suggests titles, descriptions, and tags for uploaded images.
- Image Moderation: AI scans every uploaded image for inappropriate content.
- Onboarding Assistant: AI suggests a professional bio and generates an avatar for new users.
- Facial Scan Login (2FA): Optional AI-powered identity verification with client-side face detection (MediaPipe), liveness (blink + head motion), deterministic embeddings (face-api), a 3-frame AI comparison with confidence ≥ 0.8, escalating rate limiting, and an email-link fallback.
- Digital Asset Marketplace & Collection: Artists can list their artworks as "Digital Assets" for sale.
- Digital Asset Marketplace & Collection: Users purchase assets using a points-based system.
- Digital Asset Marketplace & Collection: Purchased assets appear in the user's personal "Collection".
- Points & Rewards System: Artists earn points from "likes".
- Points & Rewards System: Users spend points to list or purchase assets.
- Points & Rewards System: A rewards page allows users to redeem points for role-based prizes.
- Booking System: Artists manage availability on a calendar.
- Booking System: Clients can request bookings, which involves email verification, artist confirmation, and optional deposit payments.
- Web3 Integration: Wallet connectivity via Web3Modal and Ethers.js.
- Web3 Integration: Artists can link real NFTs to their digital assets, with on-chain ownership verification.
- Administrative Panels: Admins can manage users, including handling artist upgrade requests.
- Administrative Panels: A backend function for Super-Admins to reconcile database users with Firebase Authentication.
- Administrative Panels: Super-Admins manage a vault for artworks from deleted users or those with NFT ownership issues.
- Administrative Panels: Super-Admins can toggle between blockchain networks (e.g., WorldChain Mainnet and WorldChain Sepolia).
- Security Features: Role-based access control (RBAC) enforced by Firebase Rules.
- Security Features: Re-authentication required for sensitive admin actions.
- Security Features: Automated account locking for unverified emails or expired trials.
- Security Features: Multi-session detection and account linking with Google.

## Style Guidelines:

- Theme inspired by ornamental and oriental tattoo styles.
- Deep reds, blacks, and golds with a dark, muted background.
- "Cinzel" for headlines.
- Grid-based, focusing on artwork with ornamental borders.
- lucide-react.
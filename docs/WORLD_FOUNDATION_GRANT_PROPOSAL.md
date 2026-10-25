# World Foundation Community Grant Proposal — Inkfinity

**Project Title:** Inkfinity — Decentralized Tattoo Art Marketplace & Human-Verified Creative Network  
**Category:** World ID Applications / World Chain Utility & Real-World Commerce  
**Ecosystem Alignment:** World ID, World Chain, MiniKit, Verified Humans Commerce  
**Repository:** Public Open-Source (GitHub)  
**License:** MIT License  
**Contact:** `contact@inkfinity.app`  

---

## 1. Executive Summary

**Inkfinity** is the first decentralized marketplace and booking network built specifically for the global tattoo and body art industry, operating natively as a **World App MiniApp**. 

By integrating **World ID** and **World Chain (WLD)**, Inkfinity solves two massive industry problems:
1. **Pervasive Identity Fraud & AI Scams:** Impersonation of renowned tattoo artists and fake portfolio theft are rampant on Instagram and social platforms. World ID provides undeniable proof of human authenticity for artists and prevents sybil-driven review manipulation.
2. **Global Peer-to-Peer Payments & Micropayments:** Tattoo deposits and appointment bookings across international borders face high banking friction. Inkfinity enables instantaneous, near-zero-fee booking deposits using **WLD on World Chain**.

---

## 2. Problem Statement & Market Opportunity

- **The Problem:** The tattoo industry generates over \$3 Billion USD globally each year, yet remains reliant on Web2 social media platforms (primarily Instagram) where bot farms, algorithmic shadowbans, and fake studio accounts deceive customers. Furthermore, booking deposits between international traveling artists and clients suffer from chargeback scams and exorbitant fiat conversion fees.
- **The World Solution:**
  - **Proof of Human Artistry:** Only verified humans (World ID) can mint verified artist profiles and list original portfolio collections.
  - **Frictionless Real-World WLD Utility:** Clients pay booking deposits directly inside World App with 1-tap MiniKit transactions.

---

## 3. Current Technical Progress & Architecture

Inkfinity is **not an unproven concept**; a fully functional production-grade MVP is already built and working:
- **World App MiniApp:** Complete integration with `@worldcoin/minikit-js` (SIWE authentication and ERC-20 WLD transaction execution).
- **Hardened Backend:** Anti-replay proof hashing, atomic nullifier reservations in real-time database, and cloud verifier checks.
- **Dual Verification 2FA:** Lightweight client-side liveness detection (Google MediaPipe) with AI-assisted verification (`gemini-3.8-flash`) and HMAC-signed session grants for studio security.
- **Decentralized Storage:** Portfolios and artwork collections indexed via IPFS and user cloud storage (no centralized vendor lock-in).

---

## 4. Requested Grant & Funding Allocation

- **Total Grant Amount Requested:** 35,000 WLD (or equivalent tier in Community Grants)
- **Use of Funds:**
  1. **Smart Contract Audits & World Chain Escrow (35%):** Deployment and formal verification of an open-source decentralized escrow contract for tattoo booking deposits on World Chain.
  2. **Artist Onboarding & Studio Adoption (40%):** Onboarding campaign targeting 100+ premier tattoo studios and independent artists in Latin America, Europe, and North America.
  3. **Infrastructure & UX Optimization (25%):** Continued optimization of the MiniApp mobile interface, internationalization (Spanish, English, Portuguese), and open-source tooling for the World ecosystem.

---

## 5. Roadmap & Deliverable Milestones

### Milestone 1: World App Store Launch & Open-Source Escrow (Month 1 - 2)
- Official listing on the World App MiniApp directory.
- Open-source smart contract repository for on-chain booking deposits with milestone release and dispute resolution on World Chain.
- Comprehensive technical documentation and developer guides.

### Milestone 2: Pilot Artist Network & Live Volume (Month 3 - 4)
- Onboarding of the first 50 verified human tattoo artists and 10 premier studios across 3 countries.
- First 500 on-chain booking deposits executed in WLD via World App.
- MiniKit UI refinement based on community feedback.

### Milestone 3: Ecosystem Expansion & Global Community (Month 5 - 6)
- Scale to 200+ verified artists and 2,500+ active users.
- Launch of human reputation scoring and on-chain artist badges for verified completed sessions.
- Publish a case study highlighting real-world commerce adoption on World Chain.

---

## 6. Commitment to Open Source

In accordance with World Foundation guidelines, all software developed under this grant is and will remain **100% Free and Open Source** under the **MIT License**. The community and fellow builders can inspect, fork, and adapt our MiniKit integration patterns and verification modules.

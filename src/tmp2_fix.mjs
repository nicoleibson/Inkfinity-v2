#!/usr/bin/env node
// FINAL (byte-exact, no literals `${` in THIS source): payment-form ETH -> tokenSymbol
"use strict";
const fs = require("fs");
const crypto = require("crypto");
const sha12 = (b) =>
  crypto.createHash("sha256").update(b).digest("hex").slice(0, 12);

const FILE =
  "src/components/payment/payment-form.tsx";

let s = fs.readFileSync(FILE, "utf8");
const cnt = (n) => s.split(n).length - 1;
const shaBuf = (b) => sha12(crypto.createHash("sha256").update(b).digest());

// ---- needles, built from charcodes (D=$, L={, R=}, B=`, S=') ----
const D = 36, L = 123, R = 125, B = 96, S = 39;
const c = (...cs) => String.fromCharCode(...cs);
const DOL = c(D), OBR = c(L), CBR = c(R), BT = c(B), SQ = c(S);

// Toast string (192): one occurrence, single-quoted in file
const T_OLD =
  SQ + "You do not have enough ETH in your wallet to complete this transaction." + SQ;
const T_NEW =
  BT + "You do not have enough " + DOL + OBR + "tokenSymbol" + CBR + " in your wallet to complete this transaction." + BT;

// Button (272): template literal in file
const B_OLD =
  BT + "Pay " + DOL + OBR + "fee.toFixed(4)} ETH Now" + CBR;
const B_NEW =
  BT + "Pay " + DOL + OBR + "fee.toFixed(4)} " + DOL + OBR + "tokenSymbol" + CBR + " Now" + CBR;

if (cnt(T_OLD) !== 1) { console.error("ABORT T_OLD cnt=" + cnt(T_OLD)); process.exit(1); }
if (cnt(T_NEW) !== 0) { console.error("ABORT T_NEW present"); process.exit(1); }
if (cnt(B_OLD) !== 1) { console.error("ABORT B_OLD cnt=" + cnt(B_OLD)); process.exit(1); }
if (cnt(B_NEW) !== 0) { console.error("ABORT B_NEW present"); process.exit(1); }

s = s.split(T_OLD).join(T_NEW);
s = s.split(B_OLD).join(B_NEW);

if (cnt(s, "ETH") !== 0) { console.error("ABORT ETH remains:" + cnt(s, "ETH")); process.exit(1); }
if (cnt(s, "tokenSymbol") < 4) { console.error("ABORT tokenSymbol low:" + cnt(s, "tokenSymbol")); process.exit(1); }

fs.writeFileSync(FILE, s);
const out = fs.readFileSync(FILE, "utf8");
console.log("WROTE sha=" + sha12(crypto.createHash("sha256").update(Buffer.from(out)).digest()), "| ETH_remaining=" + cnt(out, "ETH"), "| tokenSymbol=" + cnt(out, "tokenSymbol"));

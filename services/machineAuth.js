const crypto = require("crypto");

const {
  getMachine,
} = require("./machineRepository");


// ========================================
// LEGACY MACHINE CONFIGURATION
// ========================================
//
// Kept only as a fallback for machines that have not yet been
// issued a per-machine secret. New machines should always be
// registered through /api/machine/register, which issues a
// unique secret per machine (see verifyMachineCredential below).
//
// ========================================

const MACHINE_ID = process.env.MACHINE_ID;
const MACHINE_SECRET = process.env.MACHINE_SECRET;


// ========================================
// TIMING-SAFE STRING COMPARE
// ========================================

function timingSafeStringEqual(a, b) {

  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);

}


// ========================================
// PER-MACHINE SECRET: HASH + VERIFY
// ========================================
//
// Stored format: "<saltHex>:<hashHex>", using scrypt (built into
// Node's crypto module — no extra dependency needed).
//
// ========================================

function hashMachineSecret(secret) {

  const salt =
    crypto.randomBytes(16).toString("hex");

  const hash =
    crypto.scryptSync(secret, salt, 64).toString("hex");

  return `${salt}:${hash}`;

}


function verifyMachineSecretHash(secret, storedHash) {

  if (
    typeof secret !== "string" ||
    typeof storedHash !== "string" ||
    !storedHash.includes(":")
  ) {
    return false;
  }

  const [salt, hash] = storedHash.split(":");

  const candidateHash =
    crypto.scryptSync(secret, salt, 64).toString("hex");

  const hashBuf = Buffer.from(hash, "hex");
  const candidateBuf = Buffer.from(candidateHash, "hex");

  if (hashBuf.length !== candidateBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashBuf, candidateBuf);

}


// ========================================
// GENERATE A NEW RANDOM MACHINE SECRET
// ========================================
//
// Returned as plaintext ONCE (to hand to the installer / RPi
// config). Only the hash is ever persisted.
//
// ========================================

function generateMachineSecret() {

  return crypto.randomBytes(32).toString("hex");

}


// ========================================
// VERIFY MACHINE CREDENTIAL (main entry point)
// ========================================
//
// This is what machineSocket.js should call instead of the old
// verifyMachine(). It ties the authenticated identity to a
// specific machineId:
//
//   1. Look up the machine record BY the claimed machineId.
//   2. If it has a per-machine secret hash, the provided secret
//      must match it — the claimed machineId is only accepted if
//      its own credential verifies.
//   3. If it does NOT yet have a per-machine secret (not migrated
//      yet), fall back to the legacy single shared secret — this
//      keeps already-deployed machines working, but is logged as
//      a warning so it's visible that migration is still pending.
//
// Returns { ok: boolean, legacy?: boolean }
//
// ========================================

async function verifyMachineCredential(
  machineId,
  listenerId,
  secret
) {

  if (!machineId || !listenerId || !secret) {
    return { ok: false };
  }

  let machine = null;

  try {

    machine = await getMachine(machineId);

  } catch (error) {

    console.error(
      `❌ verifyMachineCredential lookup failed [${machineId}]:`,
      error.message
    );

    return { ok: false };

  }


  // ======================================
  // PER-MACHINE SECRET (preferred path)
  // ======================================

  if (machine && machine.machineSecretHash) {

    const ok = verifyMachineSecretHash(
      secret,
      machine.machineSecretHash
    );

    return { ok };

  }


  // ======================================
  // LEGACY FALLBACK (shared secret)
  // ======================================
  //
  // Only reachable for machines that haven't been issued a
  // per-machine secret yet. Still requires the legacy
  // listenerId/secret pair to match exactly.
  //
  // ======================================

  if (!MACHINE_ID || !MACHINE_SECRET) {
    return { ok: false };
  }

  const legacyOk =
    timingSafeStringEqual(listenerId, MACHINE_ID) &&
    timingSafeStringEqual(secret, MACHINE_SECRET);

  if (legacyOk) {

    console.warn(
      `⚠️  Machine ${machineId} authenticated via LEGACY shared ` +
      `secret. Issue it a per-machine secret via ` +
      `POST /api/machine/${machineId}/rotate-secret and update ` +
      `its RPi config.`
    );

  }

  return { ok: legacyOk, legacy: legacyOk };

}


// ========================================
// LEGACY EXPORT (kept for compatibility;
// no longer used by machineSocket.js)
// ========================================

function verifyMachine(listenerId, secret) {

  if (!MACHINE_ID || !MACHINE_SECRET) {
    return false;
  }

  return (
    timingSafeStringEqual(listenerId, MACHINE_ID) &&
    timingSafeStringEqual(secret, MACHINE_SECRET)
  );

}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  verifyMachine,
  verifyMachineCredential,
  hashMachineSecret,
  verifyMachineSecretHash,
  generateMachineSecret,
};

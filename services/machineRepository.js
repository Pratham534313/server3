const { db } = require("./firebase");

const machinesCollection =
  db.collection("machines");

// ========================================
// GET MACHINE
// ========================================

async function getMachine(machineId) {

  const doc =
    await machinesCollection
      .doc(machineId)
      .get();

  if (!doc.exists) {
    return null;
  }

  return {
    machineId: doc.id,
    ...doc.data(),
  };
}


// ========================================
// GENERATE 6-DIGIT PAIRING CODE
// ========================================

function generatePairingCode() {

  return String(
    Math.floor(
      100000 +
      Math.random() * 900000
    )
  );
}


// ========================================
// SET PAIRING CODE
// ========================================

async function setPairingCode(
  machineId,
  pairingCode
) {

  if (!machineId) {
    throw new Error(
      "machineId is required"
    );
  }

  if (!pairingCode) {
    throw new Error(
      "pairingCode is required"
    );
  }

  if (!/^\d{6}$/.test(pairingCode)) {
    throw new Error(
      "pairingCode must be exactly 6 digits"
    );
  }

  const machine =
    await getMachine(machineId);

  if (!machine) {
    throw new Error(
      "Machine not found"
    );
  }

  await updateMachine(
    machineId,
    {
      pairingCode,

      pairingCodeCreatedAt:
        new Date().toISOString(),

      paired: false,
    }
  );

  return getMachine(machineId);
}


// ========================================
// CREATE MACHINE
// ========================================

async function createMachine(
  machineId,
  ownerId = null,
  name = "AlphaCut Machine"
) {

  if (!machineId) {
    throw new Error(
      "machineId is required"
    );
  }

  const machineRef =
    machinesCollection
      .doc(machineId);

  const existing =
    await machineRef.get();

  if (existing.exists) {
    throw new Error(
      "Machine already exists"
    );
  }

  const now =
    new Date().toISOString();

  const machine = {

    machineId,

    ownerId,

    name,

    paired:
      ownerId !== null,

    pairingCode: null,

    pairingCodeCreatedAt: null,

    connected: false,

    status: "offline",

    dispatcherReady: false,

    sawReady: false,

    firmwareVersion: null,

    machineState: null,

    emergency: false,

    createdAt: now,

    updatedAt: now,
  };

  await machineRef.set(
    machine
  );

  return machine;
}


// ========================================
// ENSURE MACHINE EXISTS (idempotent)
// ========================================
//
// Creates a minimal unpaired machine record if (and only if) one
// doesn't already exist for this machineId. Never touches an
// existing record's fields. Used right after WS auth succeeds,
// so a brand-new machine's Firestore doc exists BEFORE we try to
// generate its pairing code or save its self-migrated secret —
// closing the "first connection ever" timing gap.
//
// ========================================

async function ensureMachineExists(
  machineId
) {

  if (!machineId) {
    throw new Error(
      "machineId is required"
    );
  }

  const existing =
    await getMachine(
      machineId
    );

  if (existing) {
    return existing;
  }

  try {

    return await createMachine(
      machineId,
      null,
      "AlphaCut Machine"
    );

  } catch (error) {

    // Benign race: another connection created it
    // between our check and this call.
    if (
      error.message ===
      "Machine already exists"
    ) {

      return getMachine(
        machineId
      );

    }

    throw error;

  }

}


// ========================================
// UPDATE MACHINE

// ========================================

async function updateMachine(
  machineId,
  updates
) {

  if (!machineId) {
    throw new Error(
      "machineId is required"
    );
  }

  if (!updates) {
    throw new Error(
      "updates are required"
    );
  }

  const machineRef =
    machinesCollection
      .doc(machineId);

  await machineRef.set(
    {
      ...updates,

      updatedAt:
        new Date().toISOString(),
    },
    {
      merge: true,
    }
  );

  return getMachine(
    machineId
  );
}


// ========================================
// CHECK OWNERSHIP
// ========================================

async function isMachineOwner(
  machineId,
  ownerId
) {

  if (!machineId || !ownerId) {
    return false;
  }

  const machine =
    await getMachine(
      machineId
    );

  if (!machine) {
    return false;
  }

  return (
    machine.ownerId === ownerId
  );
}


// ========================================
// GET USER MACHINES
// ========================================

async function getMachinesByOwner(
  ownerId
) {

  if (!ownerId) {
    return [];
  }

  const snapshot =
    await machinesCollection
      .where(
        "ownerId",
        "==",
        ownerId
      )
      .get();

  return snapshot.docs.map(
    (doc) => ({
      machineId: doc.id,
      ...doc.data(),
    })
  );
}


// ========================================
// DELETE MACHINE
// ========================================

async function deleteMachine(
  machineId
) {

  if (!machineId) {
    throw new Error(
      "machineId is required"
    );
  }

  await machinesCollection
    .doc(machineId)
    .delete();

  return true;
}


// ========================================
// EXPORTS
// ========================================

module.exports = {

  getMachine,

  generatePairingCode,

  setPairingCode,

  createMachine,

  ensureMachineExists,

  updateMachine,

  isMachineOwner,

  getMachinesByOwner,

  deleteMachine,

};

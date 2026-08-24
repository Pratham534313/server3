// ========================================
// COMMAND VALIDATION
// ========================================
//
// This is the server-side allowlist gate for machine commands.
// It intentionally mirrors the RPi agent's translate_to_fluidnc()
// vocabulary (main.py) so nothing is rejected here that the RPi
// would otherwise accept, and nothing arbitrary reaches the RPi
// in the first place.
//
// This is NOT a substitute for the RPi/FluidNC-level safety
// checks — it's an additional layer that stops obviously invalid
// or malicious strings before they're ever forwarded.
//
// ========================================

const KNOWN_EXACT_COMMANDS = new Set([

  "STATUS",
  "ESTOP",
  "ALL STOP",

  // Recognized machine vocabulary. Some of these are still
  // rejected downstream by the RPi until FluidNC config.yaml
  // axis mapping is finalized — that's intentional and expected;
  // this layer only confirms the command NAME is legitimate.
  "ROLLER FWD",
  "ROLLER REV",
  "ROLLER STOP",
  "SAW FWD",
  "SAW REV",
  "SAW STOP",

  "!",
  "~",
  "?",

]);

const MAX_COMMAND_LENGTH = 200;

// Printable ASCII only (no control characters) for raw
// FluidNC/G-code passthrough commands.
const SAFE_ASCII_PATTERN = /^[\x20-\x7E]+$/;


function isValidCommand(command) {

  if (typeof command !== "string") {
    return false;
  }

  const trimmed = command.trim();

  if (!trimmed) {
    return false;
  }

  if (trimmed.length > MAX_COMMAND_LENGTH) {
    return false;
  }

  const upper = trimmed.toUpperCase();

  if (KNOWN_EXACT_COMMANDS.has(upper)) {
    return true;
  }

  // Raw FluidNC system commands ($...) and G/M-code passthrough.
  if (/^[$GM]/i.test(trimmed)) {
    return SAFE_ASCII_PATTERN.test(trimmed);
  }

  return false;

}


module.exports = {
  isValidCommand,
};

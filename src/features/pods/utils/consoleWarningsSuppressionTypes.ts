/**
 * Global type declarations for console warning suppression flags
 * These prevent repetitive warnings from flooding the console during development
 */

declare global {
  var __hatIdWarningLogged: boolean | undefined;
  var __hatIdMissingLogged: boolean | undefined;
  var __memberHatIdWarningLogged: boolean | undefined;
  var __memberHatIdMissingLogged: boolean | undefined;
  var __largeHatIdWarningLogged: boolean | undefined;
  var __viemConversionLogged: boolean | undefined;
  var __podCreationErrorLogged: boolean | undefined;
  var __treasuryErrorLogged: boolean | undefined;
}

// Ensure this file is treated as a module
export type {};
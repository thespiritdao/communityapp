/**
 * TypeScript declarations for ABI JSON imports
 *
 * This allows TypeScript to properly handle JSON ABI imports from the @/abis directory
 */

declare module '@/abis/*.json' {
  const value: any[];
  export default value;
}

declare module '*.json' {
  const value: any;
  export default value;
}

declare module '../../lib/sol-price' {
  export function getCachedAssetPriceUSD(assetId: string): number | null;
  export function getCachedSolPriceUSD(): number | null;
  export function getAssetPriceUSD(options: { assetId: string; cacheMs?: number; retries?: number }): Promise<number>;
  export function getSolPriceUSD(options?: { cacheMs?: number; retries?: number }): Promise<number>;
}

declare module '../../lib/sol-price.js' {
  export function getCachedAssetPriceUSD(assetId: string): number | null;
  export function getCachedSolPriceUSD(): number | null;
  export function getAssetPriceUSD(options: { assetId: string; cacheMs?: number; retries?: number }): Promise<number>;
  export function getSolPriceUSD(options?: { cacheMs?: number; retries?: number }): Promise<number>;
}

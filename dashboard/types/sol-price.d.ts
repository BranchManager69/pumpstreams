declare module '../../lib/sol-price.js' {
  export function getCachedSolPriceUSD(): number | null;
  export function getSolPriceUSD(options?: { cacheMs?: number; retries?: number }): Promise<number>;
}

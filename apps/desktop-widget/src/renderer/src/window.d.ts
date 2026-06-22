import type { EcoApi } from '@shared/contracts';

declare global {
  interface Window {
    eco: EcoApi;
  }
}

export {};

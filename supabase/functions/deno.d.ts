// Ambient type definitions for Deno runtime APIs used in Supabase Edge Functions.
// This resolves "Cannot find name 'Deno'" in editors when the Deno language server is not active.

declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): Record<string, string>;
  }

  export const env: Env;

  export function serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void;
  export function serve(
    options: {
      port?: number;
      hostname?: string;
      onListen?: (params: { port: number; hostname: string }) => void;
      onError?: (error: unknown) => Response | Promise<Response>;
      [key: string]: unknown;
    },
    handler: (req: Request) => Response | Promise<Response>
  ): void;
}

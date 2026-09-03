/**
 * `@kubernetes/client-node` ships as ESM only, while this application is
 * compiled to CommonJS, so it can be reached only through a dynamic import.
 *
 * Two things follow, and both are deliberate:
 *
 * - Nothing outside this file may import the package for a value. Types are
 *   fine — `import type` is erased before the module loader ever sees it.
 * - The import happens on the first call, not at module load, so a ShopHub
 *   running with `KUBERNETES_ENABLED=false` never loads the package at all.
 *   That is what lets the unit and integration tests run without it.
 */
export type KubernetesSdk = typeof import('@kubernetes/client-node');

let sdk: Promise<KubernetesSdk> | null = null;

export function loadKubernetesSdk(): Promise<KubernetesSdk> {
  sdk ??= import('@kubernetes/client-node');
  return sdk;
}

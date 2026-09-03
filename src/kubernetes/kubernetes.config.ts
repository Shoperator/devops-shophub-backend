import { ConfigService } from '@nestjs/config';

/** How the client finds its credentials. */
export type KubernetesAuthMode = 'auto' | 'in-cluster' | 'kubeconfig';

const AUTH_MODES: KubernetesAuthMode[] = ['auto', 'in-cluster', 'kubeconfig'];

/**
 * Off by default, so a checkout runs — and its tests pass — without a cluster.
 * The deployment turns it on explicitly.
 */
export function isKubernetesEnabled(config: ConfigService): boolean {
  return config.get<string>('KUBERNETES_ENABLED', 'false') === 'true';
}

export function getKubernetesAuthMode(
  config: ConfigService,
): KubernetesAuthMode {
  const mode = config.get<string>('KUBERNETES_AUTH_MODE', 'auto');
  if (!AUTH_MODES.includes(mode as KubernetesAuthMode)) {
    throw new Error(
      `KUBERNETES_AUTH_MODE must be one of ${AUTH_MODES.join(', ')}, not "${mode}"`,
    );
  }
  return mode as KubernetesAuthMode;
}

/**
 * Names ShopHub as the author of the fields it writes, so `kubectl` can show
 * who last set them and a future move to server-side apply has an owner.
 */
export function getKubernetesFieldManager(config: ConfigService): string {
  return config.get<string>('KUBERNETES_FIELD_MANAGER', 'shophub');
}

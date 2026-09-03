import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  CUSTOM_OBJECT_CLIENT,
  CustomObjectClient,
} from './custom-object.client';
import { DisabledCustomObjectClient } from './disabled-custom-object.client';
import { KubernetesCustomObjectClient } from './kubernetes-custom-object.client';
import {
  getKubernetesAuthMode,
  getKubernetesFieldManager,
  isKubernetesEnabled,
  KubernetesAuthMode,
} from './kubernetes.config';
import { KubernetesSdk, loadKubernetesSdk } from './kubernetes-sdk';

/**
 * Whether to use the pod's own credentials or a kubeconfig file from disk.
 *
 * Kubernetes sets KUBERNETES_SERVICE_HOST inside every container it runs, and
 * nothing else does, so its presence answers "am I running in a cluster?".
 * `loadFromCluster` reads that same variable to find the API server, so when it
 * is missing there is nothing for in-cluster mode to connect to anyway.
 *
 * That is what makes `auto` worth defaulting to: the same image works on a
 * laptop and in a pod without either one being told which it is.
 */
function resolvesToInCluster(mode: KubernetesAuthMode): boolean {
  return (
    mode === 'in-cluster' ||
    (mode === 'auto' && process.env.KUBERNETES_SERVICE_HOST !== undefined)
  );
}

function loadCredentials(
  sdk: KubernetesSdk,
  mode: KubernetesAuthMode,
): InstanceType<KubernetesSdk['KubeConfig']> {
  const kubeConfig = new sdk.KubeConfig();
  const inCluster = resolvesToInCluster(mode);

  try {
    if (inCluster) {
      // The service account token the pod was given, refreshed in place.
      kubeConfig.loadFromCluster();
    } else {
      kubeConfig.loadFromDefault();
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Kubernetes credentials could not be loaded (${inCluster ? 'in-cluster' : 'kubeconfig'}): ` +
        `${reason}. Set KUBERNETES_ENABLED=false to run ShopHub without a cluster.`,
    );
  }

  return kubeConfig;
}

export async function createCustomObjectClient(
  config: ConfigService,
): Promise<CustomObjectClient> {
  const logger = new Logger('Kubernetes');

  if (!isKubernetesEnabled(config)) {
    logger.warn(
      'KUBERNETES_ENABLED is not "true": shops are recorded but never deployed.',
    );
    return new DisabledCustomObjectClient();
  }

  const sdk = await loadKubernetesSdk();
  const mode = getKubernetesAuthMode(config);
  const kubeConfig = loadCredentials(sdk, mode);

  // `loadFromDefault` falls back to a stock localhost cluster when there is no
  // kubeconfig at all, so the address is worth stating: it is the difference
  // between "pointed at the wrong cluster" and "pointed at nothing", and both
  // otherwise surface much later as a connection error on the first shop.
  const cluster = kubeConfig.getCurrentCluster();
  if (cluster === null) {
    throw new Error(
      `Kubernetes credentials (${mode}) name no cluster to talk to. ` +
        'Set KUBERNETES_ENABLED=false to run ShopHub without a cluster.',
    );
  }
  logger.log(`Managing shops through ${cluster.server} (${mode})`);

  return new KubernetesCustomObjectClient(
    sdk,
    kubeConfig.makeApiClient(sdk.CustomObjectsApi),
    getKubernetesFieldManager(config),
  );
}

/**
 * Provides the one way into the cluster. The factory is async because the
 * client package can only be loaded dynamically, and because failing here
 * fails the whole bootstrap — a ShopHub that cannot reach its cluster should
 * not come up pretending it can.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CUSTOM_OBJECT_CLIENT,
      inject: [ConfigService],
      useFactory: createCustomObjectClient,
    },
  ],
  exports: [CUSTOM_OBJECT_CLIENT],
})
export class KubernetesModule {}

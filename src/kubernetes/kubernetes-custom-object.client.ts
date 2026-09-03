// Type-only: the package is ESM and this file is compiled to CommonJS, so the
// values come from `loadKubernetesSdk()` instead. See `kubernetes-sdk.ts`.
import type { CustomObjectsApi } from '@kubernetes/client-node';
import {
  CustomObjectClient,
  CustomResource,
  CustomResourceRef,
} from './custom-object.client';
import { classifyKubernetesError } from './kubernetes-api.error';
import { KubernetesSdk } from './kubernetes-sdk';

/**
 * The real client. Minimal functionality: 
 * it translates the four arguments of a call and normalises whatever comes back out, 
 * holds no policy of its own (what a 409 or a 404 *means* is decided by the caller).
 */
export class KubernetesCustomObjectClient implements CustomObjectClient {
  constructor(
    private readonly sdk: KubernetesSdk,
    private readonly api: CustomObjectsApi,
    private readonly fieldManager: string,
  ) {}

  async create(
    ref: CustomResourceRef,
    resource: CustomResource,
  ): Promise<void> {
    await this.call(() =>
      this.api.createNamespacedCustomObject({
        group: ref.group,
        version: ref.version,
        namespace: ref.namespace,
        plural: ref.plural,
        body: resource,
        fieldManager: this.fieldManager,
      }),
    );
  }

  async patch(
    ref: CustomResourceRef,
    spec: Record<string, unknown>,
  ): Promise<void> {
    await this.call(() =>
      this.api.patchNamespacedCustomObject(
        {
          group: ref.group,
          version: ref.version,
          namespace: ref.namespace,
          plural: ref.plural,
          name: ref.name,
          body: { spec },
          fieldManager: this.fieldManager,
        },
        // Without the header the API server answers 415, which reads like a
        // bug in the request body rather than a missing content type.
        this.sdk.setHeaderOptions(
          'Content-Type',
          this.sdk.PatchStrategy.MergePatch,
        ),
      ),
    );
  }

  /**
   * The call returns as soon as the resource is marked for deletion.
  */
  async delete(ref: CustomResourceRef): Promise<void> {
    await this.call(() =>
      this.api.deleteNamespacedCustomObject({
        group: ref.group,
        version: ref.version,
        namespace: ref.namespace,
        plural: ref.plural,
        name: ref.name,
      }),
    );
  }

  private async call<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      throw classifyKubernetesError(error);
    }
  }
}

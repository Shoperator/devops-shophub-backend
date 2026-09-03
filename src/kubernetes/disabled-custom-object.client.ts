import { Logger } from '@nestjs/common';
import {
  CustomObjectClient,
  CustomResource,
  CustomResourceRef,
} from './custom-object.client';

/**
 * Stands in for a cluster that is not there. Every call logs what it would have
 * sent and succeeds, so ShopHub can be developed and tested against its own
 * database alone.
 *
 * It warns rather than logs: a deployment that reaches this by accident records
 * shops that were never deployed.
 */
export class DisabledCustomObjectClient implements CustomObjectClient {
  private readonly logger = new Logger('KubernetesDisabled');

  create(ref: CustomResourceRef, resource: CustomResource): Promise<void> {
    this.logger.warn(
      `Not creating ${describe(ref)}: ${JSON.stringify(resource.spec)}`,
    );
    return Promise.resolve();
  }

  patch(ref: CustomResourceRef, spec: Record<string, unknown>): Promise<void> {
    this.logger.warn(`Not patching ${describe(ref)}: ${JSON.stringify(spec)}`);
    return Promise.resolve();
  }

  delete(ref: CustomResourceRef): Promise<void> {
    this.logger.warn(`Not deleting ${describe(ref)}`);
    return Promise.resolve();
  }
}

function describe(ref: CustomResourceRef): string {
  return `${ref.plural}/${ref.name} in namespace "${ref.namespace}"`;
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Shop, ShopAvailability } from './entities/shop.entity';

/** Group and version of the CRDs installed by the shop-operator Helm chart. */
export const SHOP_API_VERSION = 'shop.shophub.local/v1';

/** `standard` runs two replicas, `high` three. Kept in step with the Shop CRD. */
export function replicasFor(availability: ShopAvailability): number {
  return availability === ShopAvailability.HIGH ? 3 : 2;
}

/** The Shop custom resource ShopHub hands to the operator. */
export interface ShopManifest {
  apiVersion: string;
  kind: 'Shop';
  metadata: { name: string; namespace: string };
  spec: {
    name: string;
    availability: ShopAvailability;
    walletAddress: string;
    database: string;
  };
}

@Injectable()
export class ShopDeploymentService {
  private readonly logger = new Logger(ShopDeploymentService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Creates the shop's resources, or brings them in line with a changed
   * configuration. Answers with the URL the site is reachable at.
   */
  apply(shop: Shop): Promise<string> {
    const manifest = this.buildManifest(shop);

    // kubernetes api calls to be implemented
    this.logger.log(
      `Would apply ${manifest.kind} "${manifest.metadata.name}" in namespace ` +
        `"${manifest.metadata.namespace}" (${replicasFor(shop.availability)} ` +
        `replicas, ${shop.database}): ${JSON.stringify(manifest.spec)}`,
    );

    return Promise.resolve(this.buildUrl(shop));
  }

  /** Tears the shop's resources down. */
  remove(shop: Shop): Promise<void> {
    const namespace = this.getNamespace();

    // kubernetes api calls to be implemented
    this.logger.log(
      `Would delete Shop "${shop.slug}" in namespace "${namespace}"`,
    );

    return Promise.resolve();
  }

  private buildManifest(shop: Shop): ShopManifest {
    return {
      apiVersion: SHOP_API_VERSION,
      kind: 'Shop',
      metadata: { name: shop.slug, namespace: this.getNamespace() },
      spec: {
        name: shop.name,
        availability: shop.availability,
        walletAddress: shop.walletAddress,
        database: shop.database,
      },
    };
  }

  /** The host the operator's Ingress publishes the shop under. */
  private buildUrl(shop: Shop): string {
    const domain = this.config.get<string>('SHOP_BASE_DOMAIN', 'shop.local');
    return `http://${shop.slug}.${domain}`;
  }

  private getNamespace(): string {
    return this.config.get<string>('SHOP_NAMESPACE', 'default');
  }
}

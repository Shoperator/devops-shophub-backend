import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CUSTOM_OBJECT_CLIENT } from '../kubernetes/custom-object.client';
// Type-only: `emitDecoratorMetadata` would otherwise emit a runtime reference
// to an interface that does not exist at runtime.
import type {
  CustomObjectClient,
  CustomResourceRef,
} from '../kubernetes/custom-object.client';
import { statusOf } from '../kubernetes/kubernetes-api.error';
import { Shop, ShopAvailability } from './entities/shop.entity';

/** Group and version of the CRDs installed by the shop-operator Helm chart. */
export const SHOP_API_VERSION = 'shop.shophub.local/v1';

const SHOP_GROUP = 'shop.shophub.local';
const SHOP_VERSION = 'v1';
const SHOP_PLURAL = 'shops';

/**
 * The statuses the API server answers with that ShopHub reacts to. Plain
 * numbers rather than Nest's `HttpStatus`: these are answers coming in, not
 * the responses ShopHub sends out.
 */
const ApiStatus = {
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  UnprocessableEntity: 422,
  ServerError: 500,
} as const;

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

  constructor(
    private readonly config: ConfigService,
    @Inject(CUSTOM_OBJECT_CLIENT)
    private readonly client: CustomObjectClient,
  ) {}

  /**
   * Creates the shop's resources, or brings them in line with a changed
   * configuration. Answers with the URL the site is reachable at.
   */
  async apply(shop: Shop): Promise<string> {
    const ref = this.buildRef(shop);
    const manifest = this.buildManifest(shop);

    await this.run(`deploy shop "${shop.slug}"`, async () => {
      try {
        await this.client.create(ref, manifest);
      } catch (error) {
        if (statusOf(error) !== ApiStatus.Conflict) {
          throw error;
        }
        // Already in the cluster. That is the reconfigure path, and also where
        // a retry lands after a create the API server accepted but ShopHub
        // never saw the answer to.
        await this.client.patch(ref, manifest.spec);
      }
    });

    return this.buildUrl(shop);
  }

  /** Tears the shop's resources down. */
  async remove(shop: Shop): Promise<void> {
    const ref = this.buildRef(shop);

    await this.run(`remove shop "${shop.slug}"`, async () => {
      try {
        await this.client.delete(ref);
      } catch (error) {
        if (statusOf(error) !== ApiStatus.NotFound) {
          throw error;
        }
      }
    });
  }

  private async run(action: string, call: () => Promise<void>): Promise<void> {
    try {
      await call();
    } catch (error) {
      throw this.toHttpException(action, error);
    }
  }

  private toHttpException(action: string, error: unknown): HttpException {
    const detail = error instanceof Error ? error.message : String(error);
    const status = statusOf(error);
    this.logger.error(`Could not ${action}: ${detail}`);

    if (
      status === ApiStatus.BadRequest ||
      status === ApiStatus.UnprocessableEntity
    ) {
      return new BadRequestException(detail);
    }

    // Rejected credentials, an unreachable cluster, or the cluster itself
    // failing. 
    if (
      status === null ||
      status === ApiStatus.Unauthorized ||
      status === ApiStatus.Forbidden ||
      status >= ApiStatus.ServerError
    ) {
      return new ServiceUnavailableException(
        'Shops cannot be deployed right now. Please try again.',
      );
    }

    return new InternalServerErrorException(`Could not ${action}`);
  }

  private buildRef(shop: Shop): CustomResourceRef {
    return {
      group: SHOP_GROUP,
      version: SHOP_VERSION,
      namespace: this.getNamespace(),
      plural: SHOP_PLURAL,
      // The slug, never the shop's name: every resource the operator creates,
      // the ingress host and the URL are all built from this.
      name: shop.slug,
    };
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

  /**
   * The host the operator's Ingress publishes the shop under.
   *
   * Derived rather than read back from the resource's status: the operator
   * writes that only once it has reconciled, so it is never there in time for
   * the request that created the shop. It builds the host from the same slug,
   * so the two agree — but the domain is hardcoded in the operator, and
   * `SHOP_BASE_DOMAIN` has to be kept equal to it.
   */
  private buildUrl(shop: Shop): string {
    const domain = this.config.get<string>('SHOP_BASE_DOMAIN', 'shop.local');
    return `http://${shop.slug}.${domain}`;
  }

  private getNamespace(): string {
    return this.config.get<string>('SHOP_NAMESPACE', 'default');
  }
}

import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CUSTOM_OBJECT_CLIENT } from '../kubernetes/custom-object.client';
import { KubernetesApiError } from '../kubernetes/kubernetes-api.error';
import { Shop, ShopAvailability, ShopDatabase } from './entities/shop.entity';
import { ShopDeploymentService } from './shop-deployment.service';

const settings: Record<string, string> = {
  SHOP_NAMESPACE: 'shops',
  SHOP_BASE_DOMAIN: 'shop.local',
};

const SHOP_REF = {
  group: 'shop.shophub.local',
  version: 'v1',
  namespace: 'shops',
  plural: 'shops',
  name: 'prodavnica-odece-abc123',
};

function shop(overrides: Partial<Shop> = {}): Shop {
  return {
    id: 'shop-id',
    name: 'Prodavnica odeće',
    slug: 'prodavnica-odece-abc123',
    availability: ShopAvailability.STANDARD,
    walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f42D0B',
    database: ShopDatabase.POSTGRESQL,
    url: null,
    ...overrides,
  } as Shop;
}

describe('ShopDeploymentService', () => {
  let deployment: ShopDeploymentService;
  let client: { create: jest.Mock; patch: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    client = {
      create: jest.fn().mockResolvedValue(undefined),
      patch: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ShopDeploymentService,
        { provide: CUSTOM_OBJECT_CLIENT, useValue: client },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback: string) => settings[key] ?? fallback,
          },
        },
      ],
    }).compile();

    deployment = moduleRef.get(ShopDeploymentService);
  });

  describe('apply', () => {
    it('creates the Shop resource the operator reconciles', async () => {
      await deployment.apply(shop());

      expect(client.create).toHaveBeenCalledWith(SHOP_REF, {
        apiVersion: 'shop.shophub.local/v1',
        kind: 'Shop',
        metadata: {
          name: 'prodavnica-odece-abc123',
          namespace: 'shops',
        },
        spec: {
          name: 'Prodavnica odeće',
          availability: 'standard',
          walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f42D0B',
          database: 'postgresql',
        },
      });
    });

    it('names the resource after the slug, not the shop', async () => {
      // Everything the operator builds — the deployments, the ingress host and
      // so the URL — is named after this.
      await deployment.apply(shop());

      const [ref, manifest] = client.create.mock.calls[0] as [
        { name: string },
        { metadata: { name: string }; spec: { name: string } },
      ];
      expect(ref.name).toBe('prodavnica-odece-abc123');
      expect(manifest.metadata.name).toBe('prodavnica-odece-abc123');
      expect(manifest.spec.name).toBe('Prodavnica odeće');
    });

    it('leaves the replica count to the operator', async () => {
      await deployment.apply(shop({ availability: ShopAvailability.HIGH }));

      const [, manifest] = client.create.mock.calls[0] as [
        unknown,
        { spec: Record<string, unknown> },
      ];
      expect(manifest.spec).not.toHaveProperty('replicas');
    });

    it('sends no status, which belongs to the operator', async () => {
      await deployment.apply(shop());

      const [, manifest] = client.create.mock.calls[0] as [unknown, object];
      expect(manifest).not.toHaveProperty('status');
    });

    it('publishes the shop under its own host', async () => {
      await expect(deployment.apply(shop())).resolves.toBe(
        'http://prodavnica-odece-abc123.shop.local',
      );
    });

    it('reconfigures a shop that is already in the cluster', async () => {
      client.create.mockRejectedValue(new KubernetesApiError('exists', 409));

      await deployment.apply(shop({ availability: ShopAvailability.HIGH }));

      expect(client.patch).toHaveBeenCalledWith(SHOP_REF, {
        name: 'Prodavnica odeće',
        availability: 'high',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f42D0B',
        database: 'postgresql',
      });
    });

    it('sends no empty value in a patch, which would delete the field', async () => {
      client.create.mockRejectedValue(new KubernetesApiError('exists', 409));

      await deployment.apply(shop());

      const [, spec] = client.patch.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(Object.values(spec).every((value) => value != null)).toBe(true);
    });

    it('passes on what the API server refused about the shop', async () => {
      client.create.mockRejectedValue(
        new KubernetesApiError('availability: unsupported value', 422),
      );

      await expect(deployment.apply(shop())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('does not blame the owner for credentials ShopHub got wrong', async () => {
      client.create.mockRejectedValue(new KubernetesApiError('forbidden', 403));

      await expect(deployment.apply(shop())).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('reports a cluster it cannot reach as unavailable', async () => {
      client.create.mockRejectedValue(
        new KubernetesApiError('ECONNREFUSED', null),
      );

      await expect(deployment.apply(shop())).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('does not hammer the API server after it was refused', async () => {
      client.create.mockRejectedValue(new KubernetesApiError('forbidden', 403));

      await expect(deployment.apply(shop())).rejects.toThrow();
      expect(client.create).toHaveBeenCalledTimes(1);
      expect(client.patch).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the Shop resource, and the operator cleans up after it', async () => {
      await deployment.remove(shop());

      expect(client.delete).toHaveBeenCalledWith(SHOP_REF);
    });

    it('treats a shop that is already gone as removed', async () => {
      // Otherwise a shop deleted out of band could never be deleted here.
      client.delete.mockRejectedValue(new KubernetesApiError('gone', 404));

      await expect(deployment.remove(shop())).resolves.toBeUndefined();
    });

    it('reports a failed teardown, so the shop stays listed', async () => {
      client.delete.mockRejectedValue(
        new KubernetesApiError('ECONNREFUSED', null),
      );

      await expect(deployment.remove(shop())).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});

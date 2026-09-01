import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Shop, ShopAvailability, ShopDatabase } from './entities/shop.entity';
import { replicasFor, ShopDeploymentService } from './shop-deployment.service';

const settings: Record<string, string> = {
  SHOP_NAMESPACE: 'shops',
  SHOP_BASE_DOMAIN: 'shop.local',
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

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ShopDeploymentService,
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

  describe('replicasFor', () => {
    it('runs two replicas for standard availability', () => {
      expect(replicasFor(ShopAvailability.STANDARD)).toBe(2);
    });

    it('runs three replicas for high availability', () => {
      expect(replicasFor(ShopAvailability.HIGH)).toBe(3);
    });
  });

  describe('apply', () => {
    it('publishes the shop under its own host', async () => {
      await expect(deployment.apply(shop())).resolves.toBe(
        'http://prodavnica-odece-abc123.shop.local',
      );
    });

    it('gives every shop a different address', async () => {
      const first = await deployment.apply(shop({ slug: 'odeca-abc123' }));
      const second = await deployment.apply(shop({ slug: 'hrana-def456' }));

      expect(first).not.toBe(second);
    });
  });

  describe('remove', () => {
    it('reports the teardown as done', async () => {
      await expect(deployment.remove(shop())).resolves.toBeUndefined();
    });
  });
});

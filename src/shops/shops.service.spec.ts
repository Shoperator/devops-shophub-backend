import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Shop, ShopAvailability, ShopDatabase } from './entities/shop.entity';
import { ShopDeploymentService } from './shop-deployment.service';
import { ShopRepository } from './shop.repository';
import { ShopsService } from './shops.service';

const OWNER_ID = 'c0000000-0000-4000-8000-000000000001';

const creation = {
  name: 'Prodavnica odeće',
  availability: ShopAvailability.HIGH,
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f42D0B',
  database: ShopDatabase.POSTGRESQL,
};

function storedShop(overrides: Partial<Shop> = {}): Shop {
  return {
    id: 'shop-id',
    name: 'Prodavnica odeće',
    slug: 'prodavnica-odece-abc123',
    availability: ShopAvailability.STANDARD,
    walletAddress: creation.walletAddress,
    database: ShopDatabase.POSTGRESQL,
    url: 'http://prodavnica-odece-abc123.localhost',
    ownerId: OWNER_ID,
    ...overrides,
  } as Shop;
}

describe('ShopsService', () => {
  let shopsService: ShopsService;
  let shopRepository: {
    findAllByOwner: jest.Mock;
    findByIdAndOwner: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let deployment: { apply: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    shopRepository = {
      findAllByOwner: jest.fn(),
      findByIdAndOwner: jest.fn(),
      create: jest.fn((data: Partial<Shop>) => data as Shop),
      save: jest.fn((shop: Shop) => Promise.resolve(shop)),
      remove: jest.fn((shop: Shop) => Promise.resolve(shop)),
    };
    deployment = {
      apply: jest.fn().mockResolvedValue('http://a-shop.localhost'),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ShopsService,
        { provide: ShopRepository, useValue: shopRepository },
        { provide: ShopDeploymentService, useValue: deployment },
      ],
    }).compile();

    shopsService = moduleRef.get(ShopsService);
  });

  describe('create', () => {
    it('keeps the configuration the owner chose', async () => {
      const shop = await shopsService.create(OWNER_ID, creation);

      expect(shop).toMatchObject({
        name: 'Prodavnica odeće',
        availability: ShopAvailability.HIGH,
        walletAddress: creation.walletAddress,
        database: ShopDatabase.POSTGRESQL,
        ownerId: OWNER_ID,
      });
    });

    it('turns the shop name into a legal Kubernetes object name', async () => {
      const shop = await shopsService.create(OWNER_ID, creation);

      expect(shop.slug).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
      expect(shop.slug).toContain('prodavnica-odece');
      expect(shop.slug.length).toBeLessThanOrEqual(40);
    });

    it('gives two shops of the same name their own resources', async () => {
      const first = await shopsService.create(OWNER_ID, creation);
      const second = await shopsService.create(OWNER_ID, creation);

      expect(first.slug).not.toBe(second.slug);
    });

    it('drops the digits a shop name is allowed to carry', async () => {
      const shop = await shopsService.create(OWNER_ID, {
        ...creation,
        name: 'Odeca 24 sata',
      });

      expect(shop.slug).toMatch(/^odeca-sata-[0-9a-f]{6}$/);
    });

    it('still produces a usable name when the shop is called a number', async () => {
      const shop = await shopsService.create(OWNER_ID, {
        ...creation,
        name: '2024',
      });

      expect(shop.slug).toMatch(/^shop-[0-9a-f]{6}$/);
    });

    it('stores the shop before the cluster is asked for anything', async () => {
      await shopsService.create(OWNER_ID, creation);

      expect(shopRepository.save).toHaveBeenCalled();
      expect(deployment.apply.mock.invocationCallOrder[0]).toBeGreaterThan(
        shopRepository.save.mock.invocationCallOrder[0],
      );
    });

    it('records the URL the deployment answered with', async () => {
      const shop = await shopsService.create(OWNER_ID, creation);

      expect(shop.url).toBe('http://a-shop.localhost');
      expect(shopRepository.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ url: 'http://a-shop.localhost' }),
      );
    });

    it('keeps the stored shop when the deployment fails', async () => {
      deployment.apply.mockRejectedValue(new Error('cluster unreachable'));

      await expect(shopsService.create(OWNER_ID, creation)).rejects.toThrow(
        'cluster unreachable',
      );
      expect(shopRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('getOwned', () => {
    it('returns the shop', async () => {
      const stored = storedShop();
      shopRepository.findByIdAndOwner.mockResolvedValue(stored);

      await expect(shopsService.getOwned(OWNER_ID, 'shop-id')).resolves.toBe(
        stored,
      );
    });

    it('hides a shop that belongs to somebody else', async () => {
      shopRepository.findByIdAndOwner.mockResolvedValue(null);

      await expect(
        shopsService.getOwned(OWNER_ID, 'someone-elses'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      shopRepository.findByIdAndOwner.mockResolvedValue(storedShop());
    });

    it('changes only the settings the request carried', async () => {
      const shop = await shopsService.update(OWNER_ID, 'shop-id', {
        availability: ShopAvailability.HIGH,
      });

      expect(shop.availability).toBe(ShopAvailability.HIGH);
      expect(shop.name).toBe('Prodavnica odeće');
      expect(shop.walletAddress).toBe(creation.walletAddress);
    });

    it('moves the payments to the new wallet', async () => {
      const shop = await shopsService.update(OWNER_ID, 'shop-id', {
        walletAddress: '0x0000000000000000000000000000000000000042',
      });

      expect(shop.walletAddress).toBe(
        '0x0000000000000000000000000000000000000042',
      );
    });

    it('leaves the shop where it is, under the name it was created with', async () => {
      const shop = await shopsService.update(OWNER_ID, 'shop-id', {
        availability: ShopAvailability.HIGH,
      });

      expect(shop.name).toBe('Prodavnica odeće');
      expect(shop.slug).toBe('prodavnica-odece-abc123');
      expect(shop.url).toBe('http://a-shop.localhost');
    });

    it('reconfigures the deployment with the new settings', async () => {
      await shopsService.update(OWNER_ID, 'shop-id', {
        availability: ShopAvailability.HIGH,
      });

      expect(deployment.apply).toHaveBeenCalledWith(
        expect.objectContaining({ availability: ShopAvailability.HIGH }),
      );
    });

    it('does not touch the cluster for a shop that is not there', async () => {
      shopRepository.findByIdAndOwner.mockResolvedValue(null);

      await expect(
        shopsService.update(OWNER_ID, 'missing', {
          availability: ShopAvailability.HIGH,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(deployment.apply).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('tears the cluster resources down before dropping the row', async () => {
      shopRepository.findByIdAndOwner.mockResolvedValue(storedShop());

      await shopsService.remove(OWNER_ID, 'shop-id');

      expect(deployment.remove).toHaveBeenCalled();
      expect(shopRepository.remove.mock.invocationCallOrder[0]).toBeGreaterThan(
        deployment.remove.mock.invocationCallOrder[0],
      );
    });

    it('keeps the shop listed when its resources could not be removed', async () => {
      shopRepository.findByIdAndOwner.mockResolvedValue(storedShop());
      deployment.remove.mockRejectedValue(new Error('cluster unreachable'));

      await expect(shopsService.remove(OWNER_ID, 'shop-id')).rejects.toThrow(
        'cluster unreachable',
      );
      expect(shopRepository.remove).not.toHaveBeenCalled();
    });

    it('refuses to delete a shop the account does not own', async () => {
      shopRepository.findByIdAndOwner.mockResolvedValue(null);

      await expect(
        shopsService.remove(OWNER_ID, 'someone-elses'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(deployment.remove).not.toHaveBeenCalled();
    });
  });
});

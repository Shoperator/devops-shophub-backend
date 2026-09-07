import request from 'supertest';
import {
  ShopHubTestApp,
  startShopHubApp,
  stopShopHubApp,
  uniqueUsername,
} from './shophub-app';

const PASSWORD = 'sup3r-secret';
const AUTH = '/api/v1/auth';
const SHOPS = '/api/v1/shops';

const WALLET = '0x742d35Cc6634C0532925a3b844Bc9e7595f42D0B';
const OTHER_WALLET = '0x0000000000000000000000000000000000000042';

const clothes = {
  name: 'Prodavnica odece',
  availability: 'standard',
  walletAddress: WALLET,
  database: 'postgresql',
};

interface ShopResponse {
  id: string;
  name: string;
  slug: string;
  availability: string;
  walletAddress: string;
  database: string;
  url: string | null;
  createdAt: string;
}

describe('Shops (e2e)', () => {
  let testApp: ShopHubTestApp;
  let server: ReturnType<ShopHubTestApp['app']['getHttpServer']>;
  let token: string;

  beforeAll(async () => {
    testApp = await startShopHubApp();
    server = testApp.app.getHttpServer();
    token = await register();
  }, 180_000);

  afterAll(async () => {
    await stopShopHubApp(testApp);
  });

  /** Registers a new owner and returns their access token. */
  async function register(prefix = 'owner'): Promise<string> {
    const response = await request(server)
      .post(`${AUTH}/register`)
      .send({ username: uniqueUsername(prefix), password: PASSWORD })
      .expect(201);

    return (response.body as { accessToken: string }).accessToken;
  }

  async function createShop(
    accessToken = token,
    shop: Record<string, unknown> = clothes,
  ): Promise<ShopResponse> {
    const response = await request(server)
      .post(SHOPS)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(shop)
      .expect(201);

    return response.body as ShopResponse;
  }

  describe('POST /shops', () => {
    it('creates the shop with the configuration it was given', async () => {
      const shop = await createShop();

      expect(shop).toMatchObject({
        name: clothes.name,
        availability: 'standard',
        walletAddress: WALLET,
        database: 'postgresql',
      });
      expect(shop.id).toEqual(expect.any(String));
    });

    it('publishes the shop at its own address', async () => {
      const shop = await createShop();

      // Nothing sets SHOP_BASE_DOMAIN here, so this is the default, and it
      // has to be the domain the operator publishes under.
      expect(shop.url).toBe(`http://${shop.slug}.localhost`);
    });

    it('names the cluster resources', async () => {
      const shop = await createShop(token, {
        ...clothes,
        name: 'Prodavnica ZDRAVE hrane 24',
      });

      expect(shop.slug).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
      expect(shop.slug.length).toBeLessThanOrEqual(40);
    });

    it('rejects a name with anything but latin letters and digits', async () => {
      await request(server)
        .post(SHOPS)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...clothes, name: 'Prodavnica odece!!!' })
        .expect(400);
    });

    it('rejects a name written in another script', async () => {
      await request(server)
        .post(SHOPS)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...clothes, name: 'Продавница одеће' })
        .expect(400);
    });

    it('takes a name with the accents the language uses', async () => {
      const shop = await createShop(token, {
        ...clothes,
        name: 'Prodavnica odeće',
      });

      expect(shop.name).toBe('Prodavnica odeće');
      expect(shop.slug).toMatch(/^prodavnica-odece-[0-9a-f]{6}$/);
    });

    it('lets one owner run two shops of the same name', async () => {
      const first = await createShop();
      const second = await createShop();

      expect(first.slug).not.toBe(second.slug);
    });

    it('rejects an availability that is not from enum from Shop CRD', async () => {
      await request(server)
        .post(SHOPS)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...clothes, availability: 'extreme' })
        .expect(400);
    });

    it('rejects a database that has no operator behind it', async () => {
      await request(server)
        .post(SHOPS)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...clothes, database: 'sqlite' })
        .expect(400);
    });

    it('rejects a wallet address in invalid format', async () => {
      await request(server)
        .post(SHOPS)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...clothes, walletAddress: 'not a wallet' })
        .expect(400);
    });

    it('rejects a request without a token', async () => {
      await request(server).post(SHOPS).send(clothes).expect(401);
    });
  });

  describe('GET /shops', () => {
    it('lists only the shops the account owns', async () => {
      const mine = await createShop();
      const strangerToken = await register('stranger');
      const theirs = await createShop(strangerToken);

      const response = await request(server)
        .get(SHOPS)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(200);

      const listed = response.body as ShopResponse[];
      expect(listed.map((shop) => shop.id)).toEqual([theirs.id]);
      expect(listed.map((shop) => shop.id)).not.toContain(mine.id);
    });

    it('rejects a request without a token', async () => {
      await request(server).get(SHOPS).expect(401);
    });
  });

  describe('GET /shops/:id', () => {
    it('returns the shop', async () => {
      const created = await createShop();

      const response = await request(server)
        .get(`${SHOPS}/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body as ShopResponse).toEqual(created);
    });

    it('hides a shop belonging to another account', async () => {
      const created = await createShop();
      const strangerToken = await register('stranger');

      await request(server)
        .get(`${SHOPS}/${created.id}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(404);
    });

    it('rejects an id that is not in correct format', async () => {
      await request(server)
        .get(`${SHOPS}/not-a-uuid`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('PATCH /shops/:id', () => {
    it('changes the availability the shop runs at', async () => {
      const created = await createShop();

      const response = await request(server)
        .patch(`${SHOPS}/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ availability: 'high' })
        .expect(200);

      expect((response.body as ShopResponse).availability).toBe('high');
    });

    it('moves the payments to another wallet', async () => {
      const created = await createShop();

      const response = await request(server)
        .patch(`${SHOPS}/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ walletAddress: OTHER_WALLET })
        .expect(200);

      expect((response.body as ShopResponse).walletAddress).toBe(OTHER_WALLET);
    });

    it('refuses to rename a shop', async () => {
      const created = await createShop();

      await request(server)
        .patch(`${SHOPS}/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Prodavnica zdrave hrane' })
        .expect(400);

      const response = await request(server)
        .get(`${SHOPS}/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body as ShopResponse).toEqual(created);
    });

    it('leaves the name and the address on update of availability', async () => {
      const created = await createShop();

      const response = await request(server)
        .patch(`${SHOPS}/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ availability: 'high' })
        .expect(200);

      const reconfigured = response.body as ShopResponse;
      expect(reconfigured.name).toBe(created.name);
      expect(reconfigured.slug).toBe(created.slug);
      expect(reconfigured.url).toBe(created.url);
    });

    it('refuses to move a live shop onto another database', async () => {
      const created = await createShop();

      await request(server)
        .patch(`${SHOPS}/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ database: 'redis' })
        .expect(400);
    });

    it('cannot be used to take over another account’s shop', async () => {
      const created = await createShop();
      const strangerToken = await register('stranger');

      await request(server)
        .patch(`${SHOPS}/${created.id}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ availability: 'high' })
        .expect(404);
    });
  });

  describe('DELETE /shops/:id', () => {
    it('removes the shop', async () => {
      const created = await createShop();

      await request(server)
        .delete(`${SHOPS}/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(server)
        .get(`${SHOPS}/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it("doesn't delete shop belonging to another account", async () => {
      const created = await createShop();
      const strangerToken = await register('stranger');

      await request(server)
        .delete(`${SHOPS}/${created.id}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(404);

      await request(server)
        .get(`${SHOPS}/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });
});

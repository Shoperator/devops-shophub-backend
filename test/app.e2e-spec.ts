import request from 'supertest';
import { ShopHubTestApp, startShopHubApp, stopShopHubApp } from './shophub-app';

describe('AppController (e2e)', () => {
  let testApp: ShopHubTestApp;

  beforeAll(async () => {
    testApp = await startShopHubApp();
  }, 180_000);

  afterAll(async () => {
    await stopShopHubApp(testApp);
  });

  it('serves the root under the api/v1 prefix', () => {
    return request(testApp.app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  it('does not serve anything outside the prefix', () => {
    return request(testApp.app.getHttpServer()).get('/').expect(404);
  });
});

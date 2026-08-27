import request from 'supertest';
import {
  decodeJwtPayload,
  ShopHubTestApp,
  startShopHubApp,
  stopShopHubApp,
  uniqueUsername,
} from './shophub-app';

const PASSWORD = 'sup3r-secret';
const AUTH = '/api/v1/auth';

interface UserResponse {
  id: string;
  username: string;
  createdAt: string;
}

interface AuthResponse {
  accessToken: string;
  tokenType: string;
  user: UserResponse;
}

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
}

describe('Auth (e2e)', () => {
  let testApp: ShopHubTestApp;
  let server: ReturnType<ShopHubTestApp['app']['getHttpServer']>;

  beforeAll(async () => {
    testApp = await startShopHubApp();
    server = testApp.app.getHttpServer();
  }, 180_000);

  afterAll(async () => {
    await stopShopHubApp(testApp);
  });

  async function register(prefix = 'owner'): Promise<AuthResponse> {
    const response = await request(server)
      .post(`${AUTH}/register`)
      .send({ username: uniqueUsername(prefix), password: PASSWORD })
      .expect(201);

    return response.body as AuthResponse;
  }

  async function login(
    username: string,
    password: string,
  ): Promise<AuthResponse> {
    const response = await request(server)
      .post(`${AUTH}/login`)
      .send({ username, password })
      .expect(200);

    return response.body as AuthResponse;
  }

  describe('POST /auth/register', () => {
    it('creates an account and signs it straight in', async () => {
      const session = await register();

      expect(session.tokenType).toBe('Bearer');
      expect(typeof session.accessToken).toBe('string');
      expect(session.user).toEqual({
        id: expect.any(String) as string,
        username: session.user.username,
        createdAt: expect.any(String) as string,
      });
    });

    it('never returns the password hash', async () => {
      const session = await register();

      expect(session.user).not.toHaveProperty('passwordHash');
      expect(session.user).not.toHaveProperty('password');
    });

    it('lets the new account sign in with its own credentials', async () => {
      const session = await register();

      const relogin = await login(session.user.username, PASSWORD);

      expect(relogin.user.id).toBe(session.user.id);
    });

    it('rejects a duplicate username', async () => {
      const account = { username: uniqueUsername('twin'), password: PASSWORD };

      await request(server).post(`${AUTH}/register`).send(account).expect(201);
      await request(server).post(`${AUTH}/register`).send(account).expect(409);
    });

    it('rejects a password shorter than eight characters', async () => {
      await request(server)
        .post(`${AUTH}/register`)
        .send({ username: uniqueUsername('short'), password: 'abc' })
        .expect(400);
    });

    it('rejects a username with illegal characters', async () => {
      await request(server)
        .post(`${AUTH}/register`)
        .send({ username: 'not a username!', password: PASSWORD })
        .expect(400);
    });

    it('rejects a field the registration form does not declare', async () => {
      const response = await request(server)
        .post(`${AUTH}/register`)
        .send({
          username: uniqueUsername('sneaky'),
          password: PASSWORD,
          passwordHash: 'already-hashed',
        })
        .expect(400);

      const error = response.body as ErrorResponse;
      expect(JSON.stringify(error.message)).toContain('passwordHash');
    });
  });

  describe('POST /auth/login', () => {
    it('returns a bearer token and the public profile', async () => {
      const registered = await register();

      const session = await login(registered.user.username, PASSWORD);

      expect(session.tokenType).toBe('Bearer');
      expect(session.user).toEqual({
        id: registered.user.id,
        username: registered.user.username,
        createdAt: registered.user.createdAt,
      });
    });

    it('signs the user id into the token', async () => {
      const registered = await register();

      const session = await login(registered.user.username, PASSWORD);

      expect(decodeJwtPayload(session.accessToken)).toMatchObject({
        sub: session.user.id,
        username: session.user.username,
      });
    });

    it('rejects a wrong password', async () => {
      const registered = await register();

      await request(server)
        .post(`${AUTH}/login`)
        .send({
          username: registered.user.username,
          password: 'wrong-password',
        })
        .expect(401);
    });

    it('does not reveal whether a username exists', async () => {
      const registered = await register();

      const unknownUser = await request(server)
        .post(`${AUTH}/login`)
        .send({ username: 'no-such-user', password: PASSWORD })
        .expect(401);

      const wrongPassword = await request(server)
        .post(`${AUTH}/login`)
        .send({
          username: registered.user.username,
          password: 'wrong-password',
        })
        .expect(401);

      expect((unknownUser.body as ErrorResponse).message).toBe(
        (wrongPassword.body as ErrorResponse).message,
      );
    });
  });

  describe('GET /auth/me', () => {
    it('returns the profile the token belongs to', async () => {
      const session = await register();

      const response = await request(server)
        .get(`${AUTH}/me`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(response.body as UserResponse).toEqual(session.user);
    });

    it('rejects a request without a token', async () => {
      await request(server).get(`${AUTH}/me`).expect(401);
    });

    it('rejects a malformed token', async () => {
      await request(server)
        .get(`${AUTH}/me`)
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('rejects a token signed with another secret', async () => {
      // header.payload.signature, minted outside this deployment.
      const forged = [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJ1c2VybmFtZSI6ImhhY2tlciJ9',
        'this-signature-was-not-made-with-our-secret',
      ].join('.');

      await request(server)
        .get(`${AUTH}/me`)
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });
  });
});

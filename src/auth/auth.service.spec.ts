import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const PASSWORD = 'sup3r-secret';
const CREATED_AT = new Date('2026-01-01T10:00:00.000Z');

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: {
    findByUsername: jest.Mock;
    create: jest.Mock;
    getById: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let owner: User;

  beforeAll(async () => {
    owner = {
      id: 'b3f1c0de-0000-4000-8000-000000000001',
      username: 'shop-owner',
      // Cheap rounds keep the suite fast; production hashing uses the default.
      passwordHash: await hash(PASSWORD, 4),
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
  });

  beforeEach(async () => {
    usersService = {
      findByUsername: jest.fn(),
      create: jest.fn(),
      getById: jest.fn(),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-token') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
  });

  describe('login', () => {
    it('returns a bearer token for valid credentials', async () => {
      usersService.findByUsername.mockResolvedValue(owner);

      const result = await authService.login({
        username: 'shop-owner',
        password: PASSWORD,
      });

      expect(result).toEqual({
        accessToken: 'signed-token',
        tokenType: 'Bearer',
        user: {
          id: owner.id,
          username: 'shop-owner',
          createdAt: CREATED_AT,
        },
      });
    });

    it('signs the user id into the token', async () => {
      usersService.findByUsername.mockResolvedValue(owner);

      await authService.login({ username: 'shop-owner', password: PASSWORD });

      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: owner.id,
        username: 'shop-owner',
      });
    });

    it('never leaks the password hash', async () => {
      usersService.findByUsername.mockResolvedValue(owner);

      const result = await authService.login({
        username: 'shop-owner',
        password: PASSWORD,
      });

      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('rejects an unknown username', async () => {
      usersService.findByUsername.mockResolvedValue(null);

      await expect(
        authService.login({ username: 'ghost', password: PASSWORD }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      usersService.findByUsername.mockResolvedValue(owner);

      await expect(
        authService.login({
          username: 'shop-owner',
          password: 'wrong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('reports the same message whether the username or the password is wrong', async () => {
      usersService.findByUsername.mockResolvedValueOnce(null);
      const unknownUser = await authService
        .login({ username: 'ghost', password: PASSWORD })
        .catch((error: Error) => error.message);

      usersService.findByUsername.mockResolvedValueOnce(owner);
      const wrongPassword = await authService
        .login({ username: 'shop-owner', password: 'wrong-password' })
        .catch((error: Error) => error.message);

      expect(unknownUser).toBe(wrongPassword);
    });
  });

  describe('register', () => {
    it('creates the account and signs it straight in', async () => {
      usersService.create.mockResolvedValue(owner);

      const result = await authService.register({
        username: 'shop-owner',
        password: PASSWORD,
      });

      expect(usersService.create).toHaveBeenCalledWith({
        username: 'shop-owner',
        password: PASSWORD,
      });
      expect(result).toEqual({
        accessToken: 'signed-token',
        tokenType: 'Bearer',
        user: {
          id: owner.id,
          username: 'shop-owner',
          createdAt: CREATED_AT,
        },
      });
    });
  });

  describe('getProfile', () => {
    it('returns the public fields of the signed-in user', async () => {
      usersService.getById.mockResolvedValue(owner);

      await expect(authService.getProfile(owner.id)).resolves.toEqual({
        id: owner.id,
        username: 'shop-owner',
        createdAt: CREATED_AT,
      });
    });
  });
});

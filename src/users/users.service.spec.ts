import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { compare } from 'bcryptjs';
import { QueryFailedError } from 'typeorm';
import { User } from './entities/user.entity';
import { UserRepository } from './user.repository';
import { UsersService } from './users.service';

const PASSWORD = 'sup3r-secret';

const registration = {
  username: 'shop-owner',
  password: PASSWORD,
};

describe('UsersService', () => {
  let usersService: UsersService;
  let userRepository: {
    existsByUsername: jest.Mock;
    findByUsername: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    userRepository = {
      existsByUsername: jest.fn().mockResolvedValue(false),
      findByUsername: jest.fn(),
      findById: jest.fn(),
      create: jest.fn((data: Partial<User>) => data as User),
      save: jest.fn((user: User) => Promise.resolve(user)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserRepository, useValue: userRepository },
      ],
    }).compile();

    usersService = moduleRef.get(UsersService);
  });

  describe('create', () => {
    it('stores the password as a bcrypt hash, never in plain text', async () => {
      const user = await usersService.create(registration);

      expect(user.passwordHash).not.toBe(PASSWORD);
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
      await expect(compare(PASSWORD, user.passwordHash)).resolves.toBe(true);
    });

    it('keeps the username it was given', async () => {
      const user = await usersService.create(registration);

      expect(user.username).toBe('shop-owner');
    });

    it('rejects a username that is already taken', async () => {
      userRepository.existsByUsername.mockResolvedValue(true);

      await expect(usersService.create(registration)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('turns a unique violation into a conflict, not a 500', async () => {
      // Two simultaneous registrations both pass the existsByUsername check and
      // only the database catches the duplicate.
      userRepository.save.mockRejectedValue(
        new QueryFailedError('insert into users', [], {
          code: '23505',
        } as unknown as Error),
      );

      await expect(usersService.create(registration)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('lets an unrelated database error surface', async () => {
      userRepository.save.mockRejectedValue(new Error('connection lost'));

      await expect(usersService.create(registration)).rejects.toThrow(
        'connection lost',
      );
    });
  });

  describe('getById', () => {
    it('returns the user', async () => {
      const stored = { id: 'user-id' } as User;
      userRepository.findById.mockResolvedValue(stored);

      await expect(usersService.getById('user-id')).resolves.toBe(stored);
    });

    it('throws when the user is gone', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(usersService.getById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

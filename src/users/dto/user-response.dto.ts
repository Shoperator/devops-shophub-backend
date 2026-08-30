import { User } from '../entities/user.entity';

/** The public shape of a user; the password hash never leaves the service. */
export class UserResponseDto {
  id: string;
  username: string;
  createdAt: Date;

  static fromEntity(user: User): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
    };
  }
}

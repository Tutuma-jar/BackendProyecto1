import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service';
import { Role } from '../common/enums/role.enum';
import { Student } from '../students/schemas/student.schema';
import { Teacher } from '../teachers/schemas/teacher.schema';
import { User } from './schemas/user.schema';
import { UsersService } from './users.service';

describe('BE-004: password change persistence', () => {
  const oldPassword = 'synthetic-old-password';
  const newPassword = 'synthetic-new-password';
  let module: TestingModule;
  let auth: AuthService;
  let exec: jest.Mock;
  let signAsync: jest.Mock;
  let events: string[];
  let savedHash: string | undefined;
  let savedChangedAt: Date | undefined;
  let user: {
    id: string;
    email: string;
    role: Role;
    passwordHash: string;
    passwordChangedAt?: Date;
    save: jest.Mock;
  };

  beforeEach(async () => {
    events = [];
    savedHash = undefined;
    savedChangedAt = undefined;
    user = {
      id: '000000000000000000000001',
      email: 'synthetic@example.invalid',
      role: Role.Estudiante,
      passwordHash: await bcrypt.hash(oldPassword, 4),
      save: jest.fn(async () => {
        savedHash = user.passwordHash;
        savedChangedAt = user.passwordChangedAt;
        events.push('saved');
        return user;
      }),
    };
    exec = jest.fn().mockResolvedValue(user);
    signAsync = jest.fn(async () => {
      events.push('signed');
      return 'synthetic-token';
    });
    module = await Test.createTestingModule({
      providers: [
        UsersService,
        AuthService,
        { provide: getModelToken(User.name), useValue: {
          findById: jest.fn(() => ({ select: jest.fn(() => ({ exec })) })),
        } },
        { provide: getModelToken(Student.name), useValue: {} },
        { provide: getModelToken(Teacher.name), useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: JwtService, useValue: { signAsync } },
      ],
    }).compile();
    auth = module.get(AuthService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('persists the hash and change timestamp before signing a new token', async () => {
    await expect(auth.changePassword(user.id, {
      currentPassword: oldPassword, newPassword,
    })).resolves.toEqual({ accessToken: 'synthetic-token' });

    expect(user.save).toHaveBeenCalledTimes(1);
    expect(savedHash).toBeDefined();
    expect(await bcrypt.compare(newPassword, savedHash!)).toBe(true);
    expect(await bcrypt.compare(oldPassword, savedHash!)).toBe(false);
    expect(savedChangedAt).toBeInstanceOf(Date);
    expect(events).toEqual(['saved', 'signed']);
    expect(signAsync).toHaveBeenCalledTimes(1);
  });

  it('does not save or sign when the current password is wrong', async () => {
    await expect(auth.changePassword(user.id, {
      currentPassword: 'synthetic-wrong-password', newPassword,
    })).rejects.toThrow(BadRequestException);

    expect(user.save).not.toHaveBeenCalled();
    expect(signAsync).not.toHaveBeenCalled();
    expect(user.passwordChangedAt).toBeUndefined();
  });

  it('does not save or sign when the new password matches the old password', async () => {
    await expect(auth.changePassword(user.id, {
      currentPassword: oldPassword, newPassword: oldPassword,
    })).rejects.toThrow(BadRequestException);

    expect(user.save).not.toHaveBeenCalled();
    expect(signAsync).not.toHaveBeenCalled();
    expect(user.passwordChangedAt).toBeUndefined();
  });

  it('preserves the not-found error and does not sign for a missing user', async () => {
    exec.mockResolvedValue(null);

    await expect(auth.changePassword(user.id, {
      currentPassword: oldPassword, newPassword,
    })).rejects.toThrow(NotFoundException);

    expect(user.save).not.toHaveBeenCalled();
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('does not issue a token when saving fails', async () => {
    const error = new Error('Synthetic persistence failure');
    user.save.mockRejectedValue(error);

    await expect(auth.changePassword(user.id, {
      currentPassword: oldPassword, newPassword,
    })).rejects.toBe(error);

    expect(user.save).toHaveBeenCalledTimes(1);
    expect(signAsync).not.toHaveBeenCalled();
  });
});

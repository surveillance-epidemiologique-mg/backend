import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ROLES } from '../../common/constants/roles';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UsersController } from './users.controller';

describe('UsersController invitation resend permissions', () => {
  const guard = new RolesGuard(new Reflector(), {
    get: jest.fn().mockReturnValue(true),
  } as unknown as ConfigService);

  function context(role: string): ExecutionContext {
    return {
      getHandler: () =>
        Object.getOwnPropertyDescriptor(
          UsersController.prototype,
          'resendInvitation',
        )?.value as () => unknown,
      getClass: () => UsersController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    } as unknown as ExecutionContext;
  }

  it('autorise uniquement un administrateur à renvoyer une invitation', () => {
    expect(guard.canActivate(context(ROLES.ADMINISTRATEUR))).toBe(true);
    expect(() => guard.canActivate(context(ROLES.MEDECIN))).toThrow();
    expect(() => guard.canActivate(context(ROLES.LABORATOIRE))).toThrow();
  });
});

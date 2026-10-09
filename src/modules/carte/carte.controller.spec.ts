import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ROLES } from '../../common/constants/roles';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CarteController } from './carte.controller';

describe('CarteController layer permissions', () => {
  const guard = new RolesGuard(new Reflector(), {
    get: jest.fn().mockReturnValue(true),
  } as unknown as ConfigService);

  function context(method: string, role: string): ExecutionContext {
    return {
      getHandler: () =>
        Object.getOwnPropertyDescriptor(CarteController.prototype, method)
          ?.value as () => unknown,
      getClass: () => CarteController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    } as unknown as ExecutionContext;
  }

  it('laisse les alertes régionales accessibles aux trois rôles', () => {
    for (const role of Object.values(ROLES)) {
      expect(guard.canActivate(context('regions', role))).toBe(true);
      expect(guard.canActivate(context('zoneSummary', role))).toBe(true);
    }
  });

  it('réserve les cas et les clusters à l’administrateur', () => {
    for (const method of ['cas', 'clusters']) {
      expect(guard.canActivate(context(method, ROLES.ADMINISTRATEUR))).toBe(
        true,
      );
      for (const role of [ROLES.MEDECIN, ROLES.LABORATOIRE]) {
        expect(() => guard.canActivate(context(method, role))).toThrow(
          ForbiddenException,
        );
      }
    }
  });
});

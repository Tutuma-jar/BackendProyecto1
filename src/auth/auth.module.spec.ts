import { ForbiddenException } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Role } from '../common/enums/role.enum';
import { AuthModule } from './auth.module';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Roles(Role.Admin)
class RestrictedController {
  adminOnly(): void {}

  @Roles(Role.Docente)
  teacherOnly(): void {}
}

class OpenController {
  @Public()
  login(): void {}

  authenticated(): void {}
}

describe('BE-001: global role authorization', () => {
  const reflector = new Reflector();
  const rolesGuard = new RolesGuard(reflector);

  it('registers RolesGuard after JwtAuthGuard', () => {
    const providers: { provide?: unknown; useClass?: unknown }[] =
      Reflect.getMetadata('providers', AuthModule);
    const guards = providers
      .filter((provider) => provider.provide === APP_GUARD)
      .map((provider) => provider.useClass);

    expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
  });

  it('allows admins and rejects other roles on admin-only handlers', () => {
    for (const role of [Role.Admin, Role.Docente, Role.Estudiante]) {
      const context = new ExecutionContextHost(
        [{ user: { role } }],
        RestrictedController,
        RestrictedController.prototype.adminOnly,
      );

      if (role === Role.Admin) {
        expect(rolesGuard.canActivate(context)).toBe(true);
      } else {
        expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
      }
    }
  });

  it('rejects a missing user on a restricted handler', () => {
    const context = new ExecutionContextHost(
      [{}], RestrictedController, RestrictedController.prototype.adminOnly,
    );

    expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('lets method roles override class roles', () => {
    for (const role of [Role.Admin, Role.Docente]) {
      const context = new ExecutionContextHost(
        [{ user: { role } }],
        RestrictedController,
        RestrictedController.prototype.teacherOnly,
      );

      if (role === Role.Docente) {
        expect(rolesGuard.canActivate(context)).toBe(true);
      } else {
        expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
      }
    }
  });

  it('preserves public access and handlers without role restrictions', () => {
    const publicContext = new ExecutionContextHost(
      [{}], OpenController, OpenController.prototype.login,
    );
    expect(new JwtAuthGuard(reflector).canActivate(publicContext)).toBe(true);
    expect(rolesGuard.canActivate(publicContext)).toBe(true);

    const unrestrictedContext = new ExecutionContextHost(
      [{ user: { role: Role.Estudiante } }],
      OpenController,
      OpenController.prototype.authenticated,
    );
    expect(rolesGuard.canActivate(unrestrictedContext)).toBe(true);
  });
});

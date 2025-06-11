import { Role, Permission } from '../guards/roles.guard';

export function Roles(...roles: Role[]): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata('roles', roles, target, propertyKey);
    return descriptor;
  };
}

export function Permissions(...permissions: Permission[]): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata('permissions', permissions, target, propertyKey);
    return descriptor;
  };
}

export function RequireAuth(): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata('require-auth', true, target, propertyKey);
    return descriptor;
  };
}

export function Public(): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata('public', true, target, propertyKey);
    return descriptor;
  };
}

export function RequireCompany(): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata('require-company', true, target, propertyKey);
    return descriptor;
  };
}

export function ControllerRoles(...roles: Role[]): ClassDecorator {
  return function (target: any) {
    Reflect.defineMetadata('controller-roles', roles, target);
    return target;
  };
}

export function ControllerAuth(): ClassDecorator {
  return function (target: any) {
    Reflect.defineMetadata('controller-auth', true, target);
    return target;
  };
}

export function CompanyId() {
  return function (target: any, propertyKey: string | symbol, parameterIndex: number) {
    const existingMetadata = Reflect.getMetadata('custom:decorators', target, propertyKey) || [];
    existingMetadata.push({
      index: parameterIndex,
      type: 'company-id',
    });
    Reflect.defineMetadata('custom:decorators', existingMetadata, target, propertyKey);
  };
}

export function CompanyRole() {
  return function (target: any, propertyKey: string | symbol, parameterIndex: number) {
    const existingMetadata = Reflect.getMetadata('custom:decorators', target, propertyKey) || [];
    existingMetadata.push({
      index: parameterIndex,
      type: 'company-role',
    });
    Reflect.defineMetadata('custom:decorators', existingMetadata, target, propertyKey);
  };
}

export function Authorized(...roles: Role[]): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    RequireAuth()(target, propertyKey, descriptor);
    if (roles.length > 0) {
      Roles(...roles)(target, propertyKey, descriptor);
    }
    return descriptor;
  };
}

export function RequireOwnership(resourceType: string, paramName: string = 'id'): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata('ownership', { resourceType, paramName }, target, propertyKey);
    return descriptor;
  };
}

export class DecoratorMetadata {
  static getRoles(target: any, propertyKey?: string | symbol): Role[] | undefined {
    if (propertyKey) {
      return Reflect.getMetadata('roles', target, propertyKey);
    }
    return Reflect.getMetadata('controller-roles', target);
  }

  static getPermissions(target: any, propertyKey: string | symbol): Permission[] | undefined {
    return Reflect.getMetadata('permissions', target, propertyKey);
  }

  static requiresAuth(target: any, propertyKey?: string | symbol): boolean {
    if (propertyKey) {
      return Reflect.getMetadata('require-auth', target, propertyKey) || false;
    }
    return Reflect.getMetadata('controller-auth', target) || false;
  }

  static isPublic(target: any, propertyKey: string | symbol): boolean {
    return Reflect.getMetadata('public', target, propertyKey) || false;
  }

  static requiresCompany(target: any, propertyKey: string | symbol): boolean {
    return Reflect.getMetadata('require-company', target, propertyKey) || false;
  }

  static getOwnershipRequirement(target: any, propertyKey: string | symbol): { resourceType: string; paramName: string } | undefined {
    return Reflect.getMetadata('ownership', target, propertyKey);
  }

  static getCustomDecorators(target: any, propertyKey: string | symbol): any[] {
    return Reflect.getMetadata('custom:decorators', target, propertyKey) || [];
  }
}

export function applyDecorators(controller: any, methodName: string) {
  return async (req: any, res: any, next: any) => {
    try {
      if (DecoratorMetadata.isPublic(controller, methodName)) {
        return next();
      }

      if (DecoratorMetadata.requiresAuth(controller)) {
        if (!req.user) {
          return res.status(401).json({ message: 'Authentication required' });
        }
      }

      if (DecoratorMetadata.requiresAuth(controller, methodName)) {
        if (!req.user) {
          return res.status(401).json({ message: 'Authentication required' });
        }
      }

      const requiredRoles = DecoratorMetadata.getRoles(controller, methodName) ||
        DecoratorMetadata.getRoles(controller);

      if (requiredRoles && requiredRoles.length > 0) {
        // Implementation would check user roles
      }

      const requiredPermissions = DecoratorMetadata.getPermissions(controller, methodName);
      if (requiredPermissions && requiredPermissions.length > 0) {
        // Implementation would check user permissions
      }

      const ownership = DecoratorMetadata.getOwnershipRequirement(controller, methodName);
      if (ownership) {
        // Implementation would check resource ownership
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

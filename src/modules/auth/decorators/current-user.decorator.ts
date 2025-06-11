import { Request } from 'express';

export function CurrentUser() {
  return function (target: any, propertyKey: string | symbol, parameterIndex: number) {
    const existingMetadata = Reflect.getMetadata('custom:decorators', target, propertyKey) || [];
    existingMetadata.push({
      index: parameterIndex,
      type: 'user',
    });
    Reflect.defineMetadata('custom:decorators', existingMetadata, target, propertyKey);
  };
}

export function CurrentUserProp(property: keyof Express.User) {
  return function (target: any, propertyKey: string | symbol, parameterIndex: number) {
    const existingMetadata = Reflect.getMetadata('custom:decorators', target, propertyKey) || [];
    existingMetadata.push({
      index: parameterIndex,
      type: 'user-prop',
      property,
    });
    Reflect.defineMetadata('custom:decorators', existingMetadata, target, propertyKey);
  };
}

export function getCurrentUser(req: Request): Express.User | undefined {
  return req.user;
}

export function getCurrentUserId(req: Request): string {
  if (!req.user?.id) {
    throw new Error('User not authenticated');
  }
  return req.user.id;
}

export function getCurrentUserEmail(req: Request): string | undefined {
  return req.user?.email;
}

export function getCurrentUserRoles(req: Request): string[] {
  return req.user?.roles || [];
}

export function getCurrentSessionId(req: Request): string | undefined {
  return req.sessionId;
}

export function userHasRole(req: Request, role: string): boolean {
  return req.user?.roles?.includes(role) || false;
}

export function userHasAnyRole(req: Request, roles: string[]): boolean {
  if (!req.user?.roles) return false;
  return roles.some(role => req.user!.roles.includes(role));
}

export function userHasAllRoles(req: Request, roles: string[]): boolean {
  if (!req.user?.roles) return false;
  return roles.every(role => req.user!.roles.includes(role));
}

export function isAuthenticated(req: Request): req is Request & { user: Express.User } {
  return !!req.user;
}

export function withUser<T extends (...args: any[]) => any>(
  handler: (user: Express.User, ...args: Parameters<T>) => ReturnType<T>
): T {
  return ((req: Request, ...args: any[]) => {
    if (!req.user) {
      throw new Error('User not authenticated');
    }
    return handler(req.user, req, ...args);
  }) as T;
}

export class UserContext {
  constructor(private req: Request) {}

  get user(): Express.User | undefined {
    return this.req.user;
  }

  get userId(): string | undefined {
    return this.req.user?.id;
  }

  get email(): string | undefined {
    return this.req.user?.email;
  }

  get roles(): string[] {
    return this.req.user?.roles || [];
  }

  get sessionId(): string | undefined {
    return this.req.sessionId;
  }

  get isAuthenticated(): boolean {
    return !!this.req.user;
  }

  hasRole(role: string): boolean {
    return this.roles.includes(role);
  }

  hasAnyRole(roles: string[]): boolean {
    return roles.some(role => this.hasRole(role));
  }

  hasAllRoles(roles: string[]): boolean {
    return roles.every(role => this.hasRole(role));
  }

  requireAuthentication(): asserts this is { user: Express.User } {
    if (!this.user) {
      throw new Error('Authentication required');
    }
  }

  requireRole(role: string): void {
    this.requireAuthentication();
    if (!this.hasRole(role)) {
      throw new Error(`Role '${role}' required`);
    }
  }
}

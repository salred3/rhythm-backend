export class BusinessException extends Error {
  public code: string;
  public statusCode: number;
  public details?: any;

  constructor(message: string, code: string, statusCode = 400, details?: any) {
    super(message);
    this.name = 'BusinessException';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return { name: this.name, message: this.message, code: this.code, statusCode: this.statusCode, details: this.details };
  }
}

export class ValidationException extends BusinessException {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class InvalidInputException extends BusinessException {
  constructor(field: string, message: string) {
    super(`Invalid input for field '${field}': ${message}`, 'INVALID_INPUT', 400, { field, message });
  }
}

export class RequiredFieldException extends BusinessException {
  constructor(field: string) {
    super(`Required field '${field}' is missing`, 'REQUIRED_FIELD', 400, { field });
  }
}

export class InvalidStateException extends BusinessException {
  constructor(message: string, currentState?: string, expectedState?: string) {
    super(message, 'INVALID_STATE', 409, { currentState, expectedState });
  }
}

export class StateTransitionException extends BusinessException {
  constructor(from: string, to: string, reason?: string) {
    super(`Cannot transition from '${from}' to '${to}'${reason ? `: ${reason}` : ''}`, 'INVALID_STATE_TRANSITION', 409, { from, to, reason });
  }
}

export class InsufficientPermissionsException extends BusinessException {
  constructor(resource: string, action: string, requiredRole?: string) {
    super(`Insufficient permissions to ${action} ${resource}`, 'INSUFFICIENT_PERMISSIONS', 403, { resource, action, requiredRole });
  }
}

export class ResourceAccessDeniedException extends BusinessException {
  constructor(resource: string, resourceId: string) {
    super(`Access denied to ${resource} with id '${resourceId}'`, 'RESOURCE_ACCESS_DENIED', 403, { resource, resourceId });
  }
}

export class ResourceNotFoundException extends BusinessException {
  constructor(resource: string, identifier: string | number) {
    super(`${resource} with identifier '${identifier}' not found`, 'RESOURCE_NOT_FOUND', 404, { resource, identifier });
  }
}

export class ResourceAlreadyExistsException extends BusinessException {
  constructor(resource: string, field: string, value: string) {
    super(`${resource} with ${field} '${value}' already exists`, 'RESOURCE_ALREADY_EXISTS', 409, { resource, field, value });
  }
}

export class ResourceLockedException extends BusinessException {
  constructor(resource: string, resourceId: string, lockedBy?: string) {
    super(`${resource} with id '${resourceId}' is currently locked`, 'RESOURCE_LOCKED', 423, { resource, resourceId, lockedBy });
  }
}

export class BusinessRuleViolationException extends BusinessException {
  constructor(rule: string, message: string) {
    super(message, 'BUSINESS_RULE_VIOLATION', 422, { rule });
  }
}

export class QuotaExceededException extends BusinessException {
  constructor(resource: string, limit: number, current: number) {
    super(`Quota exceeded for ${resource}. Limit: ${limit}, Current: ${current}`, 'QUOTA_EXCEEDED', 429, { resource, limit, current });
  }
}

export class SubscriptionRequiredException extends BusinessException {
  constructor(feature: string, requiredPlan: string) {
    super(`Feature '${feature}' requires ${requiredPlan} subscription`, 'SUBSCRIPTION_REQUIRED', 402, { feature, requiredPlan });
  }
}

export class OperationNotAllowedException extends BusinessException {
  constructor(operation: string, reason: string) {
    super(`Operation '${operation}' not allowed: ${reason}`, 'OPERATION_NOT_ALLOWED', 405, { operation, reason });
  }
}

export class ConcurrentModificationException extends BusinessException {
  constructor(resource: string, resourceId: string) {
    super(`${resource} with id '${resourceId}' was modified by another process`, 'CONCURRENT_MODIFICATION', 409, { resource, resourceId });
  }
}

export class DependencyException extends BusinessException {
  constructor(resource: string, dependency: string) {
    super(`Cannot complete operation on ${resource} due to dependency on ${dependency}`, 'DEPENDENCY_ERROR', 424, { resource, dependency });
  }
}

export class ExternalServiceException extends BusinessException {
  constructor(service: string, message: string, originalError?: any) {
    super(`External service '${service}' error: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502, { service, originalError });
  }
}

export class IntegrationException extends BusinessException {
  constructor(integration: string, message: string) {
    super(`Integration '${integration}' error: ${message}`, 'INTEGRATION_ERROR', 503, { integration });
  }
}


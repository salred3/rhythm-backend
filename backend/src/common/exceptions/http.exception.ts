export class HttpException extends Error {
  public status: number;
  public code: string;
  public details?: any;
  constructor(status: number, message: string, code?: string, details?: any) {
    super(message);
    this.name = 'HttpException';
    this.status = status;
    this.code = code || this.getDefaultCode(status);
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  private getDefaultCode(status: number): string {
    const statusCodes: { [key: number]: string } = {
      400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 402: 'PAYMENT_REQUIRED',
      403: 'FORBIDDEN', 404: 'NOT_FOUND', 405: 'METHOD_NOT_ALLOWED',
      406: 'NOT_ACCEPTABLE', 407: 'PROXY_AUTHENTICATION_REQUIRED',
      408: 'REQUEST_TIMEOUT', 409: 'CONFLICT', 410: 'GONE', 411: 'LENGTH_REQUIRED',
      412: 'PRECONDITION_FAILED', 413: 'PAYLOAD_TOO_LARGE', 414: 'URI_TOO_LONG',
      415: 'UNSUPPORTED_MEDIA_TYPE', 416: 'RANGE_NOT_SATISFIABLE', 417: 'EXPECTATION_FAILED',
      418: 'IM_A_TEAPOT', 421: 'MISDIRECTED_REQUEST', 422: 'UNPROCESSABLE_ENTITY',
      423: 'LOCKED', 424: 'FAILED_DEPENDENCY', 425: 'TOO_EARLY', 426: 'UPGRADE_REQUIRED',
      428: 'PRECONDITION_REQUIRED', 429: 'TOO_MANY_REQUESTS', 431: 'REQUEST_HEADER_FIELDS_TOO_LARGE',
      451: 'UNAVAILABLE_FOR_LEGAL_REASONS', 500: 'INTERNAL_SERVER_ERROR', 501: 'NOT_IMPLEMENTED',
      502: 'BAD_GATEWAY', 503: 'SERVICE_UNAVAILABLE', 504: 'GATEWAY_TIMEOUT', 505: 'HTTP_VERSION_NOT_SUPPORTED',
      506: 'VARIANT_ALSO_NEGOTIATES', 507: 'INSUFFICIENT_STORAGE', 508: 'LOOP_DETECTED', 510: 'NOT_EXTENDED',
      511: 'NETWORK_AUTHENTICATION_REQUIRED'
    };
    return statusCodes[status] || 'ERROR';
  }

  toJSON() {
    return { name: this.name, message: this.message, status: this.status, code: this.code, details: this.details };
  }
}

export class BadRequestException extends HttpException {
  constructor(message = 'Bad Request', code?: string, details?: any) { super(400, message, code, details); }
}
export class UnauthorizedException extends HttpException {
  constructor(message = 'Unauthorized', code?: string, details?: any) { super(401, message, code, details); }
}
export class ForbiddenException extends HttpException {
  constructor(message = 'Forbidden', code?: string, details?: any) { super(403, message, code, details); }
}
export class NotFoundException extends HttpException {
  constructor(message = 'Not Found', code?: string, details?: any) { super(404, message, code, details); }
}
export class ConflictException extends HttpException {
  constructor(message = 'Conflict', code?: string, details?: any) { super(409, message, code, details); }
}
export class UnprocessableEntityException extends HttpException {
  constructor(message = 'Unprocessable Entity', code?: string, details?: any) { super(422, message, code, details); }
}
export class TooManyRequestsException extends HttpException {
  constructor(message = 'Too Many Requests', code?: string, details?: any) { super(429, message, code, details); }
}
export class InternalServerErrorException extends HttpException {
  constructor(message = 'Internal Server Error', code?: string, details?: any) { super(500, message, code, details); }
}
export class BadGatewayException extends HttpException {
  constructor(message = 'Bad Gateway', code?: string, details?: any) { super(502, message, code, details); }
}
export class ServiceUnavailableException extends HttpException {
  constructor(message = 'Service Unavailable', code?: string, details?: any) { super(503, message, code, details); }
}
export class GatewayTimeoutException extends HttpException {
  constructor(message = 'Gateway Timeout', code?: string, details?: any) { super(504, message, code, details); }
}


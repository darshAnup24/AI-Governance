import { Request, Response, NextFunction } from 'express';
import { prisma } from '../index';

// Map HTTP methods + route patterns to semantic audit actions
const ACTION_MAP: Record<string, Record<string, string>> = {
  'POST': {
    '/auth/signup': 'USER_CREATED',
    '/auth/login': 'LOGIN',
    '/auth/logout': 'LOGOUT',
    '/models': 'MODEL_CREATED',
    '/policies': 'POLICY_CREATED',
    '/incidents': 'INCIDENT_CREATED',
    '/providers': 'PROVIDER_CONNECTED',
    '/invitations': 'INVITATION_SENT',
    '/api-keys': 'API_KEY_CREATED',
    '/vendors': 'VENDOR_CREATED',
    '/compliance': 'COMPLIANCE_SCAN_COMPLETED',
    '/reports': 'REPORT_GENERATED',
  },
  'PUT': {
    '/models': 'MODEL_UPDATED',
    '/policies': 'POLICY_UPDATED',
    '/incidents': 'INCIDENT_UPDATED',
    '/providers': 'PROVIDER_UPDATED',
    '/vendors': 'VENDOR_UPDATED',
    '/settings': 'SETTINGS_UPDATED',
    '/organization': 'ORGANIZATION_UPDATED',
  },
  'PATCH': {
    '/users': 'USER_UPDATED',
    '/incidents': 'INCIDENT_UPDATED',
    '/policies': 'POLICY_UPDATED',
    '/auth/profile': 'USER_UPDATED',
    '/auth/mfa': 'MFA_ENABLED',
  },
  'DELETE': {
    '/models': 'MODEL_DELETED',
    '/policies': 'POLICY_DELETED',
    '/incidents': 'INCIDENT_DELETED',
    '/providers': 'PROVIDER_DISCONNECTED',
    '/api-keys': 'API_KEY_REVOKED',
    '/vendors': 'VENDOR_DELETED',
  },
};

function getSemanticAction(method: string, path: string): string {
  const methodActions = ACTION_MAP[method.toUpperCase()];
  if (!methodActions) return `${method.toUpperCase()}_UPDATED`;
  
  for (const [pattern, action] of Object.entries(methodActions)) {
    if (path.includes(pattern)) return action;
  }
  
  return `${method.toUpperCase()}_UPDATED`;
}

export function auditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Only log mutations
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const startTime = Date.now();
  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    const duration = Date.now() - startTime;
    
    // Non-blocking audit log write
    const action = getSemanticAction(req.method, req.path);
    
    prisma.auditLog.create({
      data: {
        orgId: req.user?.orgId || 'unknown',
        userId: req.user?.userId || null,
        action: action as any,
        resource: req.path.split('/')[1] || 'unknown',
        resourceId: (req.params?.id as string) || null,
        details: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          query: Object.keys(req.query).length > 0 ? req.query : undefined,
        },
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        severity: res.statusCode >= 400 ? 'MEDIUM' : 'LOW',
      },
    }).catch(() => {}); // Non-blocking

    return originalJson(body);
  };

  next();
}

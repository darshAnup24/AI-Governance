import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { authMiddleware } from '../middleware/auth';
import { getAuditLogs } from '../engine/auditService';

export const auditRouter = Router();

// GET /api/audit-logs
auditRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId, action, resource, workspaceId, limit, offset, startDate, endDate } = req.query;

    const result = await getAuditLogs(req.user!.orgId, {
      userId: userId as string | undefined,
      action: action as any,
      resource: resource as string | undefined,
      workspaceId: workspaceId as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : 100,
      offset: offset ? parseInt(offset as string, 10) : 0,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/audit-logs/export
auditRouter.get('/export', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { format = 'json', startDate, endDate, actions } = req.query;
    const where: any = { orgId: req.user!.orgId };
    
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate as string);
      if (endDate) where.timestamp.lte = new Date(endDate as string);
    }
    
    if (actions) {
      where.action = { in: (actions as string).split(',') };
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: { user: { select: { email: true, name: true } } },
      orderBy: { timestamp: 'desc' },
      take: 10000,
    });

    if (format === 'csv') {
      const headers = 'Timestamp,Action,User,Resource,Resource ID,IP Address,Severity\n';
      const rows = logs.map(l => 
        `${l.timestamp.toISOString()},${l.action},${l.user?.email || 'unknown'},${l.resource},${l.resourceId || ''},${l.ipAddress},${l.severity}`
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-log.csv');
      res.send(headers + rows);
    } else {
      res.json({ logs, total: logs.length });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit-logs/stats
auditRouter.get('/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [totalLogs, actionCounts, recentActivity] = await Promise.all([
      prisma.auditLog.count({ where: { orgId: req.user!.orgId } }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where: { orgId: req.user!.orgId },
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 20,
      }),
      prisma.auditLog.findMany({
        where: { orgId: req.user!.orgId },
        orderBy: { timestamp: 'desc' },
        take: 10,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    res.json({ totalLogs, actionCounts, recentActivity });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

import { Router, Request, Response } from "express";

import { PERMISSIONS, requirePermission } from "../engine/rbacEngine";
import { TenantScopeError, resolveScopedTenantContext } from "../middleware/workspace";
import { serviceRegistry } from "../platform/serviceRegistry";

export const providersRouter = Router();

providersRouter.get("/", async (req: Request, res: Response) => {
  const providers = await serviceRegistry.providers.listForOrg(req.user!.orgId);
  res.json(providers);
});

providersRouter.post(
  "/",
  requirePermission(PERMISSIONS.canManageProviders),
  async (req: Request, res: Response) => {
    try {
      const scoped = await resolveScopedTenantContext(req, {
        workspaceId: req.body.workspaceId || req.workspaceId || null,
      });

      const provider = await serviceRegistry.providers.create({
        orgId: req.user!.orgId,
        workspaceId: scoped.workspaceId,
        name: req.body.name,
        type: req.body.type,
        apiKey: req.body.apiKey,
        apiUrl: req.body.apiUrl || null,
        models: req.body.models || [],
        settings: req.body.settings || {},
      });
      res.status(201).json(provider);
    } catch (err: any) {
      if (err instanceof TenantScopeError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message });
    }
  },
);

providersRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.canManageProviders),
  async (req: Request, res: Response) => {
    const providerId = String(req.params.id);
    const result = await serviceRegistry.providers.delete(providerId, req.user!.orgId);
    res.json(result);
  },
);

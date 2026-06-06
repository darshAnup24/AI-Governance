import { Router, Request, Response } from "express";
import { serviceRegistry } from "../platform/serviceRegistry";

export const dashboardRouter = Router();

dashboardRouter.get("/stats", async (req: Request, res: Response) => {
  try {
    const overview = await serviceRegistry.analytics.getOverview(req.user!.orgId);
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import { Router, Request, Response } from "express";
import { prisma } from "../index";

export const usersRouter = Router();

// GET /api/users — list users in the current org
usersRouter.get("/", async (req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            where: { orgId: req.user!.orgId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
            },
            orderBy: { createdAt: "desc" },
        });
        res.json(users);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import authRoutes from "../modules/auth/auth.routes";
import boardsRoutes from "../modules/boards/boards.routes";
import columnsRoutes from "../modules/columns/columns.routes";
import commentsRoutes from "../modules/comments/comments.routes";
import tasksRoutes from "../modules/tasks/tasks.routes";
import workspacesRoutes from "../modules/workspaces/workspaces.routes";

// Mounted at /api/v1. `authenticate` is applied per prefix (not globally) so that:
//  - /auth keeps its public endpoints, and
//  - unknown URLs still fall through to a clean 404 instead of a misleading 401.
const router = Router();

router.use("/auth", authRoutes);
router.use("/workspaces", authenticate, workspacesRoutes);
router.use("/boards", authenticate, boardsRoutes);
router.use("/columns", authenticate, columnsRoutes);
router.use("/tasks", authenticate, tasksRoutes);
router.use("/comments", authenticate, commentsRoutes);

export default router;

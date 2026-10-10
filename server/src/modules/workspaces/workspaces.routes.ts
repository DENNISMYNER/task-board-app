import { Router } from "express";
import * as boardsController from "../boards/boards.controller";
import membersRouter from "../members/members.routes";
import * as workspacesController from "./workspaces.controller";

// Mounted at /api/v1/workspaces.
const router = Router();

router.get("/", workspacesController.listMine);
router.post("/", workspacesController.create);
router.get("/:workspaceId", workspacesController.getOne);
router.patch("/:workspaceId", workspacesController.update);
router.delete("/:workspaceId", workspacesController.remove);

router.use("/:workspaceId/members", membersRouter);

router.get("/:workspaceId/boards", boardsController.listForWorkspace);
router.post("/:workspaceId/boards", boardsController.createInWorkspace);

export default router;

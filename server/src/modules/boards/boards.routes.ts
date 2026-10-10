import { Router } from "express";
import * as activityController from "../activity/activity.controller";
import * as columnsController from "../columns/columns.controller";
import * as tasksController from "../tasks/tasks.controller";
import * as boardsController from "./boards.controller";

// Mounted at /api/v1/boards.
// Convention ("shallow nesting"): creating/listing a child is nested under its parent
// (POST /boards/:id/columns); acting on one existing item uses its own flat URL (PATCH /columns/:id).
const router = Router();

router.get("/:boardId", boardsController.getOne);
router.patch("/:boardId", boardsController.update);
router.delete("/:boardId", boardsController.archive);

router.post("/:boardId/columns", columnsController.create);
router.post("/:boardId/tasks", tasksController.create);
router.get("/:boardId/activity", activityController.listForBoard);

export default router;

import { Router } from "express";
import * as activityController from "../activity/activity.controller";
import * as commentsController from "../comments/comments.controller";
import * as tasksController from "./tasks.controller";

// Mounted at /api/v1/tasks. (Creating a task lives under /boards/:boardId/tasks.)
const router = Router();

router.get("/:taskId", tasksController.getOne);
router.patch("/:taskId", tasksController.update);
router.delete("/:taskId", tasksController.remove);
router.post("/:taskId/move", tasksController.move); // drag and drop

router.get("/:taskId/comments", commentsController.listForTask);
router.post("/:taskId/comments", commentsController.create);
router.get("/:taskId/activity", activityController.listForTask);

export default router;

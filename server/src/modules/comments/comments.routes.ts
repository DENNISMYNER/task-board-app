import { Router } from "express";
import * as commentsController from "./comments.controller";

// Mounted at /api/v1/comments. (Listing/creating lives under /tasks/:taskId/comments.)
const router = Router();

router.patch("/:commentId", commentsController.update);
router.delete("/:commentId", commentsController.remove);

export default router;

import { Router } from "express";
import * as columnsController from "./columns.controller";

// Mounted at /api/v1/columns. (Creating a column lives under /boards/:boardId/columns.)
const router = Router();

router.patch("/:columnId", columnsController.update);
router.post("/:columnId/move", columnsController.move);
router.delete("/:columnId", columnsController.remove);

export default router;

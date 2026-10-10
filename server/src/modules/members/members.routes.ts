import { Router } from "express";
import * as membersController from "./members.controller";

// mergeParams lets this nested router see `:workspaceId` from the parent path.
const router = Router({ mergeParams: true });

router.get("/", membersController.list);
router.post("/", membersController.add);
router.patch("/:userId", membersController.changeRole);
router.delete("/:userId", membersController.remove);

export default router;

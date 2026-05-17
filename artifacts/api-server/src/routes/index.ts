import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import healthRouter from "./health";
import patientsRouter from "./patients";
import imagesRouter from "./images";
import settingsRouter from "./settings";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuth);
router.use(patientsRouter);
router.use(imagesRouter);
router.use(settingsRouter);
router.use(chatRouter);

export default router;

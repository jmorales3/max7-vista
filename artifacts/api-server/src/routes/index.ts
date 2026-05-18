import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import healthRouter from "./health";
import authRouter from "./auth";
import patientsRouter from "./patients";
import imagesRouter from "./images";
import tagsRouter from "./tags";
import presentationsRouter from "./presentations";
import settingsRouter from "./settings";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(requireAuth);
router.use(patientsRouter);
router.use(imagesRouter);
router.use(tagsRouter);
router.use(presentationsRouter);
router.use(settingsRouter);
router.use(chatRouter);

export default router;

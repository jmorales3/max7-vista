import { Router, type IRouter } from "express";
import healthRouter from "./health";
import patientsRouter from "./patients";
import imagesRouter from "./images";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(patientsRouter);
router.use(imagesRouter);
router.use(settingsRouter);

export default router;

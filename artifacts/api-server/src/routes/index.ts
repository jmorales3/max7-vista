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
import adminRouter from "./admin";
import auditRouter from "./audit";
import importRouter from "./import";
import profileRouter from "./profile";
import migrationRouter from "./migration";
import documentsRouter from "./documents";
import localFileRouter from "./localFile";

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
router.use(adminRouter);
router.use(auditRouter);
router.use(importRouter);
router.use(profileRouter);
router.use(migrationRouter);
router.use(documentsRouter);
router.use(localFileRouter);

export default router;

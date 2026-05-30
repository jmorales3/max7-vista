import { z } from "zod";

export const TemplateFrameSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  label: z.string().optional(),
});

export const ListTemplatesQueryParams = z.object({});

export const CreateTemplateBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  officeName: z.string().optional(),
  officeInfo: z.string().optional(),
  pageWidth: z.number().positive().default(215.9),
  pageHeight: z.number().positive().default(279.4),
  frames: z.array(TemplateFrameSchema).default([]),
});

export const GetTemplateParams = z.object({ id: z.coerce.number() });
export const UpdateTemplateParams = z.object({ id: z.coerce.number() });
export const DeleteTemplateParams = z.object({ id: z.coerce.number() });

export const UpdateTemplateBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  officeName: z.string().optional().nullable(),
  officeInfo: z.string().optional().nullable(),
  pageWidth: z.number().positive().optional(),
  pageHeight: z.number().positive().optional(),
  frames: z.array(TemplateFrameSchema).optional(),
});

export const DocumentFrameSchema = z.object({
  frameId: z.string(),
  imageId: z.number().optional(),
  panX: z.number().default(50),
  panY: z.number().default(50),
});

export const ListTemplateDocumentsQueryParams = z.object({
  patientId: z.coerce.number().optional(),
  templateId: z.coerce.number().optional(),
});

export const CreateTemplateDocumentBody = z.object({
  templateId: z.number(),
  patientId: z.number().optional(),
  title: z.string().min(1).default("Document"),
  frames: z.array(DocumentFrameSchema).default([]),
});

export const GetTemplateDocumentParams = z.object({ id: z.coerce.number() });
export const UpdateTemplateDocumentParams = z.object({ id: z.coerce.number() });
export const DeleteTemplateDocumentParams = z.object({ id: z.coerce.number() });

export const UpdateTemplateDocumentBody = z.object({
  title: z.string().min(1).optional(),
  patientId: z.number().optional().nullable(),
  frames: z.array(DocumentFrameSchema).optional(),
  printedAt: z.string().optional().nullable(),
});

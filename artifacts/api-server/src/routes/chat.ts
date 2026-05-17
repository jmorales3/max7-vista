import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const SYSTEM_PROMPT = `You are the built-in guide for Max7 Vista, a clinical patient image management system.
You help healthcare staff navigate and use the system efficiently.

Key features you can explain:
- Patients: Create, search, edit, delete patient records. Each patient has a name, patient code, date of birth, and notes.
- Capture: Take photos via webcam or upload files. Select a patient before saving. After capture, the editor opens automatically.
- Gallery: Browse all images with 1/2/4/8-per-row grid views. Filter by patient or show unassigned images.
- Image Editor: Crop, zoom, rotate, draw annotations, add text labels, erase. Save persists all edits to disk. Assign images to patients.
- Settings: Configure the root storage directory. Run directory scans to index legacy image libraries.
- Manual: Full instruction guide available in the sidebar under "Manual".
- Languages: The system supports English, Spanish, French, and Portuguese. Use the language selector in the sidebar.
- Roles: User (view/capture), Admin (manage patients/users/settings), Super Admin (full system access across all organizations).
- Multi-tenancy: Each organization is an independent tenant with fully isolated data.

Be concise, helpful, and professional. If a user asks something unrelated to Max7 Vista, politely redirect them.
Answer in the same language the user uses.`;

router.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error("Chat error:", err);
    res.write(`data: ${JSON.stringify({ error: "Chat service unavailable" })}\n\n`);
    res.end();
  }
});

export default router;

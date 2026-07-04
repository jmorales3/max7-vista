import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type SectionKey =
  | "overview"
  | "gettingStarted"
  | "patients"
  | "exportImages"
  | "capture"
  | "gallery"
  | "editor"
  | "bulkImport"
  | "documents"
  | "settings"
  | "presentations"
  | "imageLibrary"
  | "migration"
  | "roles"
  | "tenants"
  | "templates"
  | "auditLog"
  | "sessionTimeout"
  | "mfa"
  | "patientRetention"
  | "disclosures"
  | "cephalometrics";

const SECTIONS: SectionKey[] = [
  "overview",
  "gettingStarted",
  "patients",
  "exportImages",
  "capture",
  "gallery",
  "editor",
  "bulkImport",
  "documents",
  "settings",
  "presentations",
  "imageLibrary",
  "migration",
  "roles",
  "tenants",
  "templates",
  "auditLog",
  "sessionTimeout",
  "mfa",
  "patientRetention",
  "disclosures",
  "cephalometrics",
];

export default function Manual() {
  const { t } = useTranslation();
  const [active, setActive] = useState<SectionKey>("overview");
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const handleSelect = (key: SectionKey) => {
    setActive(key);
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]"
    );
    const el = document.getElementById(`manual-section-${key}`);
    if (viewport && el) {
      const viewportRect = viewport.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offset = elRect.top - viewportRect.top + viewport.scrollTop;
      viewport.scrollTo({ top: offset, behavior: "smooth" });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">{t("manual.title")}</h1>
          <p className="text-muted-foreground">{t("manual.subtitle")}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <Card className="md:w-60 shrink-0 h-fit">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t("manual.toc")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <nav className="space-y-0.5">
              {SECTIONS.map((key) => (
                <button
                  key={key}
                  onClick={() => handleSelect(key)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-left",
                    active === key
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <span>{t(`manual.sections.${key}`)}</span>
                  {active === key && <ChevronRight className="h-3.5 w-3.5 opacity-70" />}
                </button>
              ))}
            </nav>
          </CardContent>
        </Card>

        <Card className="flex-1">
          <ScrollArea className="h-[calc(100vh-280px)]" ref={scrollAreaRef}>
            <div className="p-6 space-y-8">
              {SECTIONS.map((key) => (
                <section
                  key={key}
                  id={`manual-section-${key}`}
                  className={cn(
                    "scroll-mt-6 transition-opacity",
                    active !== key && "opacity-40 pointer-events-none select-none"
                  )}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-1 w-4 rounded-full bg-primary" />
                    <h2 className="text-xl font-semibold">
                      {t(`manual.${key}.heading`)}
                    </h2>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    {t(`manual.${key}.body`)}
                  </p>
                </section>
              ))}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}

import { useRef, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useListPatients } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Calendar, FileText, Image as ImageIcon, Users } from "lucide-react";
import { format } from "date-fns";

export default function Patients() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const hasSearch = search.trim().length > 0;
  const { data: patients, isLoading } = useListPatients(
    { search: search || undefined },
    { enabled: hasSearch }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">{t("patients.title")}</h1>
          <p className="text-muted-foreground">{t("patients.subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/patients/new">
            <Plus className="mr-2 h-4 w-4" />
            {t("patients.newPatient")}
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={searchRef}
          placeholder={t("patients.searchPlaceholder")}
          className="pl-9 max-w-md bg-card"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {!hasSearch ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border rounded-lg bg-card/50 border-dashed">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Search className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-lg font-medium text-foreground">{t("patients.searchPromptTitle")}</h3>
          <p className="text-muted-foreground max-w-sm mt-2">{t("patients.searchPromptHint")}</p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="p-4 pb-2">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="flex gap-4 mt-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : patients && patients.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {patients.map((patient) => (
            <Link key={patient.id} href={`/patients/${patient.id}`}>
              <Card className="hover-elevate cursor-pointer transition-colors hover:border-primary/50 group h-full overflow-hidden">
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-xl group-hover:text-primary transition-colors">
                        {patient.name}
                      </CardTitle>
                      <CardDescription className="font-mono text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                        <FileText className="h-3 w-3" />
                        {patient.patientCode}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {patient.profileImageId ? (
                        <div className="h-12 w-12 rounded-lg overflow-hidden border-2 border-primary/30 shadow-sm">
                          <img
                            src={`/api/images/${patient.profileImageId}/file`}
                            alt={patient.name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">
                          <ImageIcon className="h-3 w-3" />
                          {patient.imageCount || 0}
                        </div>
                      )}
                      {patient.profileImageId && (
                        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">
                          <ImageIcon className="h-3 w-3" />
                          {patient.imageCount || 0}
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  {patient.dateOfBirth && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-2">
                      <Calendar className="h-4 w-4 opacity-70" />
                      {t("patients.dob")}: {format(new Date(patient.dateOfBirth + "T00:00:00"), "MMM d, yyyy")}
                    </div>
                  )}
                  {patient.notes && (
                    <p className="text-sm mt-3 line-clamp-2 text-muted-foreground/80 border-l-2 border-primary/20 pl-2">
                      {patient.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-center border rounded-lg bg-card/50 border-dashed">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-lg font-medium text-foreground">{t("patients.noResults")}</h3>
          <p className="text-muted-foreground max-w-sm mt-2 mb-6">
            {search ? t("patients.noResultsSearch") : t("patients.noResultsEmpty")}
          </p>
          {search ? (
            <Button variant="outline" onClick={() => setSearch("")}>
              {t("patients.clearSearch")}
            </Button>
          ) : (
            <Button asChild>
              <Link href="/patients/new">
                <Plus className="mr-2 h-4 w-4" />
                {t("patients.addPatient")}
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

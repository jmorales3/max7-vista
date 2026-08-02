import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCreatePatient, getListPatientsQueryKey } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  name: z.string().min(1),
  patientCode: z.string().min(1),
  dateOfBirth: z.string().optional(),
  notes: z.string().optional(),
  phone: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function PatientNew() {
  const { t, i18n } = useTranslation();
  const dateExample = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(1990, 0, 31)),
    [i18n.language],
  );
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createPatient = useCreatePatient({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        toast({
          title: t("patients.createSuccess"),
          description: t("patients.createSuccessDesc"),
        });
        setLocation(`/patients/${data.id}`);
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: t("patients.createError"),
          description: error instanceof Error ? error.message : t("common.error"),
        });
      }
    }
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      patientCode: "",
      dateOfBirth: "",
      notes: "",
      phone: "",
    },
  });

  function onSubmit(values: FormValues) {
    createPatient.mutate({ data: values });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild className="shrink-0 h-8 w-8">
          <Link href="/patients">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">{t("patients.createTitle")}</h1>
          <p className="text-muted-foreground">{t("patients.createSubtitle")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("patients.detailsTitle")}</CardTitle>
          <CardDescription>{t("patients.detailsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("patients.fullName")} <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="patientCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("patients.patientCodeLabel")} <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. PT-12345" className="font-mono" {...field} />
                      </FormControl>
                      <FormDescription>{t("patients.patientCodeHint")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>{t("patients.dateOfBirth")}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {t("patients.dateFormatHint", { example: dateExample })}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("patients.notesOptional")}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t("patients.addContextPlaceholder")}
                        className="resize-none h-24"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>{t("patients.phone")}</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="e.g. +1 555-0100" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4 pt-4 border-t">
                <Button variant="outline" type="button" asChild>
                  <Link href="/patients">{t("common.cancel")}</Link>
                </Button>
                <Button type="submit" disabled={createPatient.isPending}>
                  {createPatient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("patients.savePatient")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

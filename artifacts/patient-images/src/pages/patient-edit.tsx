import { useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import {
  useGetPatient,
  useUpdatePatient,
  getListPatientsQueryKey,
  getGetPatientQueryKey,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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

const formSchema = z.object({
  name: z.string().min(1),
  patientCode: z.string().min(1),
  dateOfBirth: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function PatientEdit() {
  const { t } = useTranslation();
  const [, params] = useRoute("/patients/:id/edit");
  const id = parseInt(params?.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: patient, isLoading } = useGetPatient(id, {
    query: { enabled: !!id, queryKey: getGetPatientQueryKey(id) },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", patientCode: "", dateOfBirth: "", notes: "" },
  });

  useEffect(() => {
    if (!patient) return;
    form.reset({
      name: patient.name,
      patientCode: patient.patientCode,
      dateOfBirth: patient.dateOfBirth ?? "",
      notes: patient.notes ?? "",
    });
  }, [patient, form]);

  const updatePatient = useUpdatePatient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPatientQueryKey(id) });
        toast({ title: t("patients.updateSuccess"), description: t("patients.updateSuccessDesc") });
        setLocation(`/patients/${id}`);
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: t("patients.updateError"),
          description: error instanceof Error ? error.message : t("common.error"),
        });
      },
    },
  });

  function onSubmit(values: FormValues) {
    updatePatient.mutate({ id, data: values });
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  if (!patient) {
    return <div className="p-12 text-center text-muted-foreground">{t("patients.notFound")}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild className="shrink-0 h-8 w-8">
          <Link href={`/patients/${id}`}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">{t("patients.editTitle")}</h1>
          <p className="text-muted-foreground">{t("patients.editSubtitleFor", { name: patient.name })}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("patients.detailsTitle")}</CardTitle>
          <CardDescription>{t("patients.editDetailsDesc")}</CardDescription>
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

              <div className="flex justify-end gap-4 pt-4 border-t">
                <Button variant="outline" type="button" asChild>
                  <Link href={`/patients/${id}`}>{t("common.cancel")}</Link>
                </Button>
                <Button type="submit" disabled={updatePatient.isPending}>
                  {updatePatient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("patients.updatePatient")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  name: z.string().min(1, "Name is required"),
  patientCode: z.string().min(1, "Patient ID/Code is required"),
  dateOfBirth: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function PatientEdit() {
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
        toast({ title: "Patient updated", description: "Changes saved successfully." });
        setLocation(`/patients/${id}`);
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Error updating patient",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
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
    return <div className="p-12 text-center text-muted-foreground">Patient not found</div>;
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
          <h1 className="text-3xl font-bold tracking-tight text-primary">Edit Patient</h1>
          <p className="text-muted-foreground">Update the record for {patient.name}.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patient Details</CardTitle>
          <CardDescription>All changes are saved immediately on submit.</CardDescription>
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
                      <FormLabel>Full Name <span className="text-destructive">*</span></FormLabel>
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
                      <FormLabel>Patient ID / MRN <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. PT-12345" className="font-mono" {...field} />
                      </FormControl>
                      <FormDescription>Must be unique across the clinic.</FormDescription>
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
                    <FormLabel>Date of Birth</FormLabel>
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
                    <FormLabel>Clinical Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add any relevant clinical context here..."
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
                  <Link href={`/patients/${id}`}>Cancel</Link>
                </Button>
                <Button type="submit" disabled={updatePatient.isPending}>
                  {updatePatient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  name: z.string().min(1, "Name is required"),
  patientCode: z.string().min(1, "Patient ID/Code is required"),
  dateOfBirth: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function PatientNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const createPatient = useCreatePatient({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        toast({
          title: "Patient created",
          description: "The patient record has been successfully created.",
        });
        setLocation(`/patients/${data.id}`);
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Error creating patient",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
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
          <h1 className="text-3xl font-bold tracking-tight text-primary">New Patient</h1>
          <p className="text-muted-foreground">Create a new patient record to store images.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patient Details</CardTitle>
          <CardDescription>Enter the primary details for this patient.</CardDescription>
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
                  <Link href="/patients">Cancel</Link>
                </Button>
                <Button type="submit" disabled={createPatient.isPending}>
                  {createPatient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Patient Record
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

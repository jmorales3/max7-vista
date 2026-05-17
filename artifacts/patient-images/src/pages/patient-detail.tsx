import { useState } from "react";
import { Link, useRoute } from "wouter";
import { 
  useGetPatient, 
  getGetPatientQueryKey,
  useListPatientImages,
  getListPatientImagesQueryKey,
  useDeletePatient,
  getListPatientsQueryKey
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ChevronLeft,
  Calendar,
  FileText,
  Camera,
  LayoutGrid,
  Trash2,
  Clock,
  MoreVertical
} from "lucide-react";
import { format } from "date-fns";
import { ImageGrid } from "@/components/image-grid";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocation } from "wouter";

export default function PatientDetail() {
  const [, params] = useRoute("/patients/:id");
  const id = parseInt(params?.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [gridColumns, setGridColumns] = useState<1 | 2 | 4 | 8>(4);

  const { data: patient, isLoading: patientLoading } = useGetPatient(id, {
    query: { enabled: !!id, queryKey: getGetPatientQueryKey(id) }
  });

  const { data: images, isLoading: imagesLoading } = useListPatientImages(id, {
    query: { enabled: !!id, queryKey: getListPatientImagesQueryKey(id) }
  });

  const deletePatient = useDeletePatient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        toast({ title: "Patient deleted" });
        setLocation("/patients");
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          title: "Error deleting patient",
          description: e instanceof Error ? e.message : "An unexpected error occurred."
        });
      }
    }
  });

  if (patientLoading) {
    return <div className="p-8"><Skeleton className="h-12 w-64 mb-8" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!patient) {
    return <div>Patient not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 border-b pb-6">
        <Button variant="outline" size="icon" asChild className="shrink-0 h-8 w-8">
          <Link href="/patients">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-primary truncate">{patient.name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5 font-mono bg-muted/50 px-2 py-0.5 rounded">
              <FileText className="h-3.5 w-3.5" />
              {patient.patientCode}
            </div>
            {patient.dateOfBirth && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                DOB: {format(new Date(patient.dateOfBirth), "MMM d, yyyy")}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Created {format(new Date(patient.createdAt), "MMM d, yyyy")}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button asChild>
            <Link href={`/capture?patientId=${patient.id}`}>
              <Camera className="mr-2 h-4 w-4" />
              Capture
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/patients/${patient.id}/edit`}>Edit Patient</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-destructive focus:text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Patient
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {patient.notes && (
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="p-4 text-sm">
            <div className="font-semibold text-primary mb-1">Clinical Notes</div>
            <p className="text-muted-foreground">{patient.notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            Image Gallery
            <span className="text-sm font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
              {images?.length || 0} images
            </span>
          </h2>

          <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-md border">
            {[1, 2, 4, 8].map((cols) => (
              <Button
                key={cols}
                variant={gridColumns === cols ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-8 px-0"
                onClick={() => setGridColumns(cols as 1 | 2 | 4 | 8)}
                title={`${cols} column${cols > 1 ? 's' : ''}`}
              >
                <LayoutGrid className="h-4 w-4" style={{ 
                  opacity: gridColumns === cols ? 1 : 0.5,
                  transform: `scale(${cols === 1 ? 1.2 : cols === 2 ? 1 : cols === 4 ? 0.8 : 0.6})`
                }} />
              </Button>
            ))}
          </div>
        </div>

        {imagesLoading ? (
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="aspect-square rounded-xl" />)}
          </div>
        ) : images && images.length > 0 ? (
          <ImageGrid images={images} columns={gridColumns} />
        ) : (
          <div className="flex flex-col items-center justify-center p-16 text-center border rounded-xl bg-card border-dashed">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Camera className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium text-foreground">No images yet</h3>
            <p className="text-muted-foreground max-w-sm mt-2 mb-6">
              Capture or upload photos to build this patient's clinical gallery.
            </p>
            <Button asChild>
              <Link href={`/capture?patientId=${patient.id}`}>
                <Camera className="mr-2 h-4 w-4" />
                Capture First Image
              </Link>
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {patient.name}'s record and all associated images.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletePatient.mutate({ id: patient.id })}
            >
              Delete Patient
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

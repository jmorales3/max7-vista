import { useState } from "react";
import { Link } from "wouter";
import { 
  useListImages, 
  getListImagesQueryKey,
  useListPatients,
  getListPatientsQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutGrid, ImageIcon, Camera } from "lucide-react";
import { ImageGrid } from "@/components/image-grid";

export default function Gallery() {
  const [patientFilter, setPatientFilter] = useState<string>("all");
  const [gridColumns, setGridColumns] = useState<1 | 2 | 4 | 8>(4);

  const { data: patients } = useListPatients({}, {
    query: { queryKey: getListPatientsQueryKey() }
  });

  const isUnassignedFilter = patientFilter === "unassigned";
  const patientIdParam = !isUnassignedFilter && patientFilter !== "all"
    ? parseInt(patientFilter, 10)
    : undefined;

  const { data: allImages, isLoading } = useListImages(
    { patientId: patientIdParam },
    { query: { queryKey: getListImagesQueryKey({ patientId: patientIdParam }) } }
  );

  const images = isUnassignedFilter
    ? allImages?.filter((img) => img.isUnassigned)
    : allImages;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Gallery</h1>
          <p className="text-muted-foreground">Browse all clinical images across patients.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={patientFilter} onValueChange={setPatientFilter}>
            <SelectTrigger className="w-[200px] bg-card">
              <SelectValue placeholder="All Patients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Patients</SelectItem>
              <SelectItem value="unassigned">Unassigned Images</SelectItem>
              {patients?.map(p => (
                <SelectItem key={p.id} value={p.id.toString()}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border shrink-0">
            {[1, 2, 4, 8].map((cols) => (
              <Button
                key={cols}
                variant={gridColumns === cols ? "secondary" : "ghost"}
                size="sm"
                className="h-8 w-9 px-0"
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
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="aspect-square rounded-xl" />)}
        </div>
      ) : images && images.length > 0 ? (
        <ImageGrid images={images} columns={gridColumns} showPatientName={true} />
      ) : (
        <div className="flex flex-col items-center justify-center p-16 text-center border rounded-xl bg-card border-dashed">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <ImageIcon className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-medium text-foreground">No images found</h3>
          <p className="text-muted-foreground max-w-sm mt-2 mb-6">
            {patientFilter !== "all" 
              ? "This patient doesn't have any images yet." 
              : "Your gallery is empty. Start by capturing some photos."}
          </p>
          <Button asChild>
            <Link href={patientFilter !== "all" ? `/capture?patientId=${patientFilter}` : "/capture"}>
              <Camera className="mr-2 h-4 w-4" />
              Capture Image
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

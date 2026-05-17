import { Link } from "wouter";
import { format } from "date-fns";
import { Image } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Calendar, User, FileText } from "lucide-react";

interface ImageGridProps {
  images: Image[];
  columns: 1 | 2 | 4 | 8;
  showPatientName?: boolean;
}

export function ImageGrid({ images, columns, showPatientName = false }: ImageGridProps) {
  const getGridClass = () => {
    switch (columns) {
      case 1: return "grid-cols-1";
      case 2: return "grid-cols-1 sm:grid-cols-2";
      case 4: return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4";
      case 8: return "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8";
      default: return "grid-cols-4";
    }
  };

  return (
    <div className={`grid ${getGridClass()} gap-4 transition-all duration-300`}>
      {images.map((image) => (
        <Link key={image.id} href={`/editor/${image.id}`}>
          <Card className="group overflow-hidden cursor-pointer hover-elevate transition-all border-muted-foreground/20 hover:border-primary/50 relative">
            <div className="aspect-square bg-black overflow-hidden flex items-center justify-center">
              <img 
                src={`/api/images/${image.id}/file`} 
                alt={image.notes || "Clinical image"} 
                className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            </div>
            
            <div className={`p-2.5 sm:p-3 border-t bg-card text-xs transition-colors ${columns === 8 ? 'hidden' : 'block'}`}>
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-1.5 text-muted-foreground font-medium truncate max-w-[80%]">
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {format(new Date(image.capturedAt), "MMM d, yyyy")}
                  </span>
                </div>
              </div>
              
              {showPatientName && image.patientName && (
                <div className="flex items-center gap-1.5 text-foreground mt-1.5 truncate">
                  <User className="h-3 w-3 shrink-0 text-primary/70" />
                  <span className="truncate">{image.patientName}</span>
                </div>
              )}
              
              {image.notes && (
                <div className="flex items-start gap-1.5 text-muted-foreground mt-1.5 line-clamp-1">
                  <FileText className="h-3 w-3 shrink-0 mt-0.5" />
                  <span className="truncate" title={image.notes}>{image.notes}</span>
                </div>
              )}
            </div>

            {/* Hover overlay for tight grids */}
            {columns === 8 && (
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 text-white text-[10px]">
                <div className="truncate font-medium">
                  {format(new Date(image.capturedAt), "MMM d, yy")}
                </div>
              </div>
            )}
          </Card>
        </Link>
      ))}
    </div>
  );
}

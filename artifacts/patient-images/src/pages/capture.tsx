import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import Webcam from "react-webcam";
import { useListPatients, getListPatientsQueryKey } from "@workspace/api-client-react";
import { uploadPatientImage } from "@/lib/upload";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Camera, Upload, X, Check, Loader2 } from "lucide-react";

export default function Capture() {
  const [searchParams] = useState(new URLSearchParams(window.location.search));
  const initialPatientId = searchParams.get("patientId");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [patientId, setPatientId] = useState<string>(initialPatientId || "");
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const webcamRef = useRef<Webcam>(null);

  const { data: patients, isLoading: loadingPatients } = useListPatients({}, {
    query: { queryKey: getListPatientsQueryKey() }
  });

  const capture = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      setCapturedImage(imageSrc);
    }
  }, [webcamRef]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setCapturedImage(URL.createObjectURL(file));
      setMode("upload");
    }
  };

  const clearSelection = () => {
    setCapturedImage(null);
    setSelectedFile(null);
  };

  const handleSave = async () => {
    if (!patientId) {
      toast({
        variant: "destructive",
        title: "Patient Required",
        description: "Please select a patient before saving."
      });
      return;
    }

    if (!capturedImage && !selectedFile) {
      return;
    }

    setIsUploading(true);
    try {
      let fileToUpload: File;

      if (selectedFile) {
        fileToUpload = selectedFile;
      } else {
        // Convert base64 to File
        const res = await fetch(capturedImage!);
        const blob = await res.blob();
        fileToUpload = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      }

      const result = await uploadPatientImage(fileToUpload, parseInt(patientId, 10), notes);
      
      toast({
        title: "Image saved successfully",
        description: "The image has been added to the patient's gallery."
      });
      
      setLocation(`/editor/${result.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred."
      });
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Capture Image</h1>
        <p className="text-muted-foreground">Acquire photos from webcam or upload from device.</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="patient">Select Patient <span className="text-destructive">*</span></Label>
            <Select 
              value={patientId} 
              onValueChange={setPatientId}
              disabled={loadingPatients}
            >
              <SelectTrigger id="patient">
                <SelectValue placeholder="Select a patient..." />
              </SelectTrigger>
              <SelectContent>
                {patients?.map(p => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name} <span className="text-muted-foreground text-xs font-mono ml-2">({p.patientCode})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!capturedImage ? (
            <div className="space-y-4">
              <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
                <Button 
                  variant={mode === "camera" ? "secondary" : "ghost"} 
                  size="sm"
                  onClick={() => setMode("camera")}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Camera
                </Button>
                <Button 
                  variant={mode === "upload" ? "secondary" : "ghost"} 
                  size="sm"
                  onClick={() => setMode("upload")}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </div>

              {mode === "camera" ? (
                <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex flex-col items-center justify-center">
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ facingMode: "environment" }}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
                    <Button 
                      size="lg" 
                      className="rounded-full h-16 w-16 p-0 border-4 border-white/20 hover:border-white shadow-xl bg-primary hover:bg-primary/90"
                      onClick={capture}
                    >
                      <Camera className="h-8 w-8" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl aspect-video flex flex-col items-center justify-center p-6 hover:bg-muted/50 transition-colors">
                  <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">Click to browse or drag image here</p>
                  <p className="text-sm text-muted-foreground mb-6">Supports JPEG, PNG up to 10MB</p>
                  <Input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    id="file-upload"
                    onChange={handleFileChange}
                  />
                  <Button asChild>
                    <Label htmlFor="file-upload" className="cursor-pointer">
                      Select File
                    </Label>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="relative rounded-xl overflow-hidden bg-muted aspect-video">
                <img 
                  src={capturedImage} 
                  alt="Captured" 
                  className="w-full h-full object-contain"
                />
                <Button 
                  variant="destructive" 
                  size="icon"
                  className="absolute top-4 right-4 rounded-full shadow-md"
                  onClick={clearSelection}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Clinical Notes</Label>
                <Textarea 
                  id="notes"
                  placeholder="Enter any context about this image..." 
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="resize-none"
                />
              </div>

              <div className="flex justify-end gap-4">
                <Button variant="outline" onClick={clearSelection}>
                  Discard
                </Button>
                <Button onClick={handleSave} disabled={isUploading || !patientId}>
                  {isUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Save & Open Editor
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

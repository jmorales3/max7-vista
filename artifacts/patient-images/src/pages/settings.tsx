import { useGetSettings, getGetSettingsQueryKey, useUpdateSettings, useScanDirectory, useGetImageStats, getGetImageStatsQueryKey } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { RefreshCw, Save, HardDrive, Database, Users, ImageIcon, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { format } from "date-fns";

export default function Settings() {
  const { toast } = useToast();
  const [storageDirectory, setStorageDirectory] = useState("");

  const { data: settings, isLoading: loadingSettings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });

  const { data: stats, isLoading: loadingStats } = useGetImageStats({
    query: { queryKey: getGetImageStatsQueryKey() }
  });

  useEffect(() => {
    if (settings?.storageDirectory) {
      setStorageDirectory(settings.storageDirectory);
    }
  }, [settings]);

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        toast({ title: "Settings saved successfully" });
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          title: "Save failed",
          description: e instanceof Error ? e.message : "An unexpected error occurred."
        });
      }
    }
  });

  const scanDirectory = useScanDirectory({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetImageStatsQueryKey() });
        toast({ 
          title: "Scan Complete", 
          description: `Scanned ${data.scanned} files. Indexed ${data.indexed} new images.` 
        });
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          title: "Scan failed",
          description: e instanceof Error ? e.message : "An unexpected error occurred."
        });
      }
    }
  });

  const handleSave = () => {
    updateSettings.mutate({ data: { storageDirectory } });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Settings</h1>
        <p className="text-muted-foreground">Manage system configuration and storage.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Database className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Images</p>
              {loadingStats ? <Skeleton className="h-8 w-16 mt-1" /> : (
                <h3 className="text-2xl font-bold">{stats?.totalImages || 0}</h3>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Patients</p>
              {loadingStats ? <Skeleton className="h-8 w-16 mt-1" /> : (
                <h3 className="text-2xl font-bold">{stats?.totalPatients || 0}</h3>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <AlertCircle className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Unassigned</p>
              {loadingStats ? <Skeleton className="h-8 w-16 mt-1" /> : (
                <h3 className="text-2xl font-bold">{stats?.unassignedImages || 0}</h3>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ImageIcon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Recent (30d)</p>
              {loadingStats ? <Skeleton className="h-8 w-16 mt-1" /> : (
                <h3 className="text-2xl font-bold">{stats?.recentUploads || 0}</h3>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Storage Configuration
          </CardTitle>
          <CardDescription>
            Configure where patient images are stored on the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="storageDirectory">Root Directory Path</Label>
            {loadingSettings ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Input 
                id="storageDirectory" 
                value={storageDirectory} 
                onChange={(e) => setStorageDirectory(e.target.value)} 
                className="font-mono"
              />
            )}
            <p className="text-sm text-muted-foreground">
              Images will be saved to this directory, organized by patient ID.
            </p>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-6">
          <Button onClick={handleSave} disabled={updateSettings.isPending || loadingSettings}>
            {updateSettings.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Settings
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Directory Indexing
          </CardTitle>
          <CardDescription>
            Scan the storage directory to index legacy files or recover out-of-sync images.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-medium">Scan Legacy Directory</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Last scan: {settings?.lastScanAt ? format(new Date(settings.lastScanAt), "MMM d, yyyy h:mm a") : "Never"}
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => scanDirectory.mutate({})} 
              disabled={scanDirectory.isPending}
            >
              {scanDirectory.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Run Scan Now
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

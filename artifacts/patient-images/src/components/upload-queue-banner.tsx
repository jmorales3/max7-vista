import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { WifiOff, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ensureUploadQueueListening,
  subscribeUploadQueue,
  processQueue,
  discardUpload,
  type QueuedUpload,
} from "@/lib/uploadQueue";

/**
 * Persistent banner shown app-wide whenever there are photos waiting to be
 * uploaded (because the connection dropped mid-visit). Lets staff see that
 * nothing was lost and manually retry or discard individual items.
 */
export function UploadQueueBanner() {
  const { t } = useTranslation();
  const [items, setItems] = useState<QueuedUpload[]>([]);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    ensureUploadQueueListening();
    return subscribeUploadQueue(setItems);
  }, []);

  if (items.length === 0) return null;

  const failed = items.filter((i) => i.status === "failed").length;
  const pending = items.length - failed;

  const handleRetryAll = async () => {
    setRetrying(true);
    try {
      await processQueue();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2">
      <div className="max-w-6xl mx-auto flex items-center gap-3 flex-wrap text-sm">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          {t("uploadQueue.pending", { count: items.length })}
        </span>
        <span className="text-amber-700">
          {failed > 0
            ? t("uploadQueue.detailWithFailed", { pending, failed })
            : t("uploadQueue.detail")}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 bg-white"
            onClick={handleRetryAll}
            disabled={retrying}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${retrying ? "animate-spin" : ""}`} />
            {t("uploadQueue.retryNow")}
          </Button>
          {items.map((item) =>
            item.status === "failed" ? (
              <Button
                key={item.id}
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-amber-700 hover:text-destructive"
                title={t("uploadQueue.discard")}
                onClick={() => discardUpload(item.id)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

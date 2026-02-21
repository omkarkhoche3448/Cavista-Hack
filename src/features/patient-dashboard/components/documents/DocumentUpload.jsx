import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Upload, X, FileUp } from "lucide-react";
import { DOCUMENT_TYPES } from "../../data/mockData";
import { cn } from "@/lib/utils";

export default function DocumentUpload({ onUpload }) {
  const [file, setFile] = useState(null);
  const [documentType, setDocumentType] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef(null);

  function handleDragOver(e) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }

  function handleFileSelect(e) {
    const selectedFile = e.target.files[0];
    if (selectedFile) setFile(selectedFile);
  }

  function clearFile() {
    setFile(null);
    setDocumentType("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload() {
    if (!file || !documentType) return;
    setUploading(true);
    setProgress(0);

    // Simulate upload progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 10;
      });
    }, 150);

    // Simulate completion
    setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      onUpload(file, documentType);
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
        clearFile();
      }, 500);
    }, 1500);
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        )}
      >
        <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium">
          Drag & drop your file here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, JPG, PNG, DOC up to 10MB
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={handleFileSelect}
        />
      </div>

      {/* Selected file preview */}
      {file && (
        <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
          <FileUp className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearFile}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Type selector + upload button */}
      {file && (
        <div className="flex items-center gap-3">
          <Select value={documentType} onValueChange={setDocumentType}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select document type" />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleUpload}
            disabled={!documentType || uploading}
          >
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      )}

      {/* Progress bar */}
      {uploading && <Progress value={progress} className="h-2" />}
    </div>
  );
}

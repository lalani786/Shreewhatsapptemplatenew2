import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Image, FileText, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  content: string;
  image_prompt?: string;
}

interface BroadcastMediaUploadProps {
  templates: Template[];
  onTemplateSelect: (template: Template) => void;
  onImageSelect: (imageUrl: string) => void;
  selectedImage: string | null;
  onRemoveImage: () => void;
}

export function BroadcastMediaUpload({
  templates,
  onTemplateSelect,
  onImageSelect,
  selectedImage,
  onRemoveImage,
}: BroadcastMediaUploadProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageSelect(reader.result as string);
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Failed to load image");
      setIsUploading(false);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleTemplateSelect = (template: Template) => {
    onTemplateSelect(template);
    setShowTemplates(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" />
          Attachments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileSelect}
        />

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex-1"
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Image className="mr-2 h-4 w-4" />
            )}
            Upload Image
          </Button>

          <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1">
                <FileText className="mr-2 h-4 w-4" />
                Import Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Import Template</DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[400px]">
                {templates.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    No templates available. Create templates in AI Template page.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        onClick={() => handleTemplateSelect(template)}
                        className="cursor-pointer rounded-lg border p-3 hover:bg-accent transition-colors"
                      >
                        <p className="font-medium">{template.name}</p>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {template.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>

        {/* Image Preview */}
        {selectedImage && (
          <div className="relative">
            <img
              src={selectedImage}
              alt="Selected"
              className="w-full rounded-lg max-h-[200px] object-contain bg-muted"
            />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8"
              onClick={onRemoveImage}
            >
              <X className="h-4 w-4" />
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Image will be sent with your message
            </p>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p>• Supported formats: JPG, PNG, GIF</p>
          <p>• Maximum size: 5MB</p>
        </div>
      </CardContent>
    </Card>
  );
}

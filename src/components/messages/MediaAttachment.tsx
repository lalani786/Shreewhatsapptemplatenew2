import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Paperclip, Image, FileText, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  content: string;
  image_prompt?: string;
}

interface MediaAttachmentProps {
  templates: Template[];
  onSelectTemplate: (template: Template) => void;
  onImageSelect: (imageUrl: string, caption?: string) => void;
  disabled?: boolean;
}

export function MediaAttachment({
  templates,
  onSelectTemplate,
  onImageSelect,
  disabled,
}: MediaAttachmentProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageCaption, setImageCaption] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setIsUploading(true);
    try {
      // Convert to base64 for preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setShowImagePreview(true);
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Failed to load image");
      setIsUploading(false);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSendImage = () => {
    if (selectedImage) {
      onImageSelect(selectedImage, imageCaption);
      setShowImagePreview(false);
      setSelectedImage(null);
      setImageCaption("");
    }
  };

  const handleTemplateSelect = (template: Template) => {
    onSelectTemplate(template);
    setShowTemplates(false);
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileSelect}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" disabled={disabled || isUploading}>
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <Image className="mr-2 h-4 w-4" />
            Upload Image
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowTemplates(true)}>
            <FileText className="mr-2 h-4 w-4" />
            Use Template
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Template Selection Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Template</DialogTitle>
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

      {/* Image Preview Dialog */}
      <Dialog open={showImagePreview} onOpenChange={setShowImagePreview}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedImage && (
              <div className="relative">
                <img
                  src={selectedImage}
                  alt="Preview"
                  className="w-full rounded-lg max-h-[300px] object-contain bg-muted"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    setSelectedImage(null);
                    setShowImagePreview(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="caption">Caption (optional)</Label>
              <Input
                id="caption"
                placeholder="Add a caption..."
                value={imageCaption}
                onChange={(e) => setImageCaption(e.target.value)}
              />
            </div>
            <Button onClick={handleSendImage} className="w-full">
              Send Image
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Eye, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Category = "MARKETING" | "UTILITY" | "AUTHENTICATION";
type HeaderFormat = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

interface TplButton {
  type: ButtonType;
  text: string;
  url?: string;
  phone_number?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const LANGUAGES = [
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi", label: "Hindi" },
  { code: "es", label: "Spanish" },
  { code: "pt_BR", label: "Portuguese (BR)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ar", label: "Arabic" },
];

export default function CreateMetaTemplateDialog({ open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("MARKETING");
  const [language, setLanguage] = useState("en_US");
  const [headerFormat, setHeaderFormat] = useState<HeaderFormat>("NONE");
  const [headerText, setHeaderText] = useState("");
  const [body, setBody] = useState("Hello {{1}}, your order {{2}} is confirmed!");
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<TplButton[]>([]);
  

  const [headerHandle, setHeaderHandle] = useState("");
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [bodyExamples, setBodyExamples] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const nameValid = useMemo(() => /^[a-z0-9_]*$/.test(name), [name]);
  const varCount = useMemo(() => (body.match(/\{\{\d+\}\}/g) || []).length, [body]);

  const addButton = (type: ButtonType) => {
    if (buttons.length >= 3) return;
    setButtons([...buttons, { type, text: "" }]);
  };
  const updateButton = (i: number, patch: Partial<TplButton>) => {
    setButtons(buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  };
  const removeButton = (i: number) => setButtons(buttons.filter((_, idx) => idx !== i));

  const reset = () => {
    setName(""); setCategory("MARKETING"); setLanguage("en_US");
    setHeaderFormat("NONE"); setHeaderText(""); setBody("");
    setFooter(""); setButtons([]);
    setHeaderHandle(""); setSampleFile(null); setBodyExamples([]);
  };

  const fileToDataUrl = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(f);
    });


  const submit = async () => {
    if (!name.trim() || !nameValid) {
      toast.error("Enter a valid template name (lowercase, numbers, underscores)");
      return;
    }
    if (!body.trim()) { toast.error("Body text is required"); return; }
    for (const b of buttons) {
      if (!b.text.trim()) { toast.error("All buttons need text"); return; }
      if (b.type === "URL" && !b.url?.trim()) { toast.error("URL button needs a URL"); return; }
      if (b.type === "PHONE_NUMBER" && !b.phone_number?.trim()) { toast.error("Call button needs a phone number"); return; }
    }

    const needsSample = headerFormat !== "NONE" && headerFormat !== "TEXT";
    if (needsSample && !headerHandle.trim() && !sampleFile) {
      toast.error(`Upload a sample ${headerFormat.toLowerCase()} (or paste a Meta header_handle) — Meta requires an example.`);
      return;
    }

    setSubmitting(true);
    try {
      let header: Record<string, unknown> | null = null;
      if (headerFormat === "TEXT") {
        header = { format: "TEXT", text: headerText };
      } else if (headerFormat !== "NONE") {
        header = { format: headerFormat };
        if (headerHandle.trim()) {
          (header as Record<string, unknown>).header_handle = headerHandle.trim();
        } else if (sampleFile) {
          const dataUrl = await fileToDataUrl(sampleFile);
          header.sample_data_url = dataUrl;
          header.sample_file_name = sampleFile.name;
          header.sample_mime_type = sampleFile.type;
        }
      }

      const { data, error } = await supabase.functions.invoke("create-meta-template", {
        body: {
          name: name.trim(),
          category,
          language,
          header,
          body,
          body_examples: varCount > 0 ? bodyExamples.slice(0, varCount) : undefined,
          footer: footer.trim() || undefined,
          buttons: buttons.length ? buttons : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Template submitted to Meta (status: ${data?.status || "PENDING"})`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit template");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Send className="h-5 w-5 text-primary" />
            Create WhatsApp Template for Meta
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          {/* LEFT: FORM */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                placeholder="e.g. order_confirmation"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
              />
              <p className={`text-xs ${nameValid ? "text-muted-foreground" : "text-destructive"}`}>
                Lowercase, numbers, underscores only
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKETING">Marketing — Promotions</SelectItem>
                    <SelectItem value="UTILITY">Utility — Updates</SelectItem>
                    <SelectItem value="AUTHENTICATION">Authentication — OTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Auto-detected from API Setup:</span> WhatsApp Business Account ID (WABA) and Meta App ID are read from your saved credentials. Update them in <span className="font-medium text-foreground">API Setup → WhatsApp Business API</span>.
            </div>


            <div className="border-t pt-4 space-y-2">
              <Label>Header</Label>
              <Select value={headerFormat} onValueChange={(v) => setHeaderFormat(v as HeaderFormat)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  <SelectItem value="TEXT">Text</SelectItem>
                  <SelectItem value="IMAGE">Image</SelectItem>
                  <SelectItem value="VIDEO">Video</SelectItem>
                  <SelectItem value="DOCUMENT">Document</SelectItem>
                </SelectContent>
              </Select>
              {headerFormat === "TEXT" && (
                <Input
                  placeholder="Header text (max 60 chars)"
                  maxLength={60}
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                />
              )}
              {headerFormat !== "NONE" && headerFormat !== "TEXT" && (
                <div className="rounded-md border border-dashed p-3 space-y-2 bg-muted/30">
                  <Label className="text-xs font-semibold">
                    Sample {headerFormat.toLowerCase()} <span className="text-destructive">*</span>
                    <span className="text-muted-foreground font-normal"> — Meta requires an example</span>
                  </Label>
                  <Input
                    type="file"
                    accept={
                      headerFormat === "IMAGE" ? "image/jpeg,image/png"
                      : headerFormat === "VIDEO" ? "video/mp4,video/3gpp"
                      : ".pdf,application/pdf"
                    }
                    onChange={(e) => setSampleFile(e.target.files?.[0] || null)}
                  />
                  {sampleFile && (
                    <p className="text-xs text-muted-foreground">
                      Selected: {sampleFile.name} ({(sampleFile.size / 1024).toFixed(0)} KB)
                    </p>
                  )}
                  <div className="text-xs text-muted-foreground">— or —</div>
                  <Input
                    placeholder="Paste an existing Meta header_handle (from resumable upload)"
                    value={headerHandle}
                    onChange={(e) => setHeaderHandle(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Limits: image ≤5MB (JPG/PNG), video ≤16MB (MP4), document ≤100MB (PDF).
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Body Text <span className="text-destructive">*</span></Label>
              <Textarea
                rows={5}
                maxLength={1024}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{1}}"}, {"{{2}}"}, etc. for dynamic variables. Max 1024 chars.
              </p>
              {varCount > 0 && (
                <div className="rounded-md border p-2 space-y-2 bg-muted/30">
                  <Label className="text-xs font-semibold">Example values for variables <span className="text-destructive">*</span></Label>
                  {Array.from({ length: varCount }).map((_, i) => (
                    <Input
                      key={i}
                      placeholder={`Example for {{${i + 1}}}`}
                      value={bodyExamples[i] || ""}
                      onChange={(e) => {
                        const next = [...bodyExamples];
                        next[i] = e.target.value;
                        setBodyExamples(next);
                      }}
                    />
                  ))}
                  <p className="text-xs text-muted-foreground">Meta requires sample values to approve templates with variables.</p>
                </div>
              )}

            </div>

            <div className="space-y-2">
              <Label>Footer <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. Reply STOP to unsubscribe"
                maxLength={60}
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
              />
            </div>

            <div className="border-t pt-4 space-y-3">
              <Label>Buttons <span className="text-muted-foreground text-xs">(optional, max 3)</span></Label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={buttons.length >= 3} onClick={() => addButton("QUICK_REPLY")}>
                  <Plus className="h-3 w-3 mr-1" /> Quick Reply
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={buttons.length >= 3} onClick={() => addButton("URL")}>
                  <Plus className="h-3 w-3 mr-1" /> URL
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={buttons.length >= 3} onClick={() => addButton("PHONE_NUMBER")}>
                  <Plus className="h-3 w-3 mr-1" /> Call
                </Button>
              </div>
              {buttons.map((b, i) => (
                <div key={i} className="rounded-md border p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{b.type.replace("_", " ")}</Badge>
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeButton(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <Input placeholder="Button text" value={b.text} onChange={(e) => updateButton(i, { text: e.target.value })} maxLength={25} />
                  {b.type === "URL" && (
                    <Input placeholder="https://example.com" value={b.url || ""} onChange={(e) => updateButton(i, { url: e.target.value })} />
                  )}
                  {b.type === "PHONE_NUMBER" && (
                    <Input placeholder="+15551234567" value={b.phone_number || ""} onChange={(e) => updateButton(i, { phone_number: e.target.value })} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: PREVIEW */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                <span className="font-medium">Preview</span>
              </div>
              <Badge variant="outline">{category}</Badge>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
              {headerFormat === "TEXT" && headerText && (
                <div className="font-semibold">{headerText}</div>
              )}
              {headerFormat !== "NONE" && headerFormat !== "TEXT" && (
                <div className="rounded bg-background/60 border border-dashed p-6 text-center text-xs text-muted-foreground">
                  {headerFormat} attachment
                </div>
              )}
              <div className="whitespace-pre-wrap text-sm">
                {body || <span className="text-muted-foreground">Your message here...</span>}
              </div>
              {footer && <div className="text-xs text-muted-foreground">{footer}</div>}
              {buttons.length > 0 && (
                <div className="pt-2 border-t space-y-1">
                  {buttons.map((b, i) => (
                    <div key={i} className="text-center text-sm text-primary py-1">
                      {b.text || <span className="italic text-muted-foreground">Button</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <strong>Note:</strong> Templates are submitted to Meta for review.
              Approval typically takes minutes to hours. Only approved templates can be used for messaging.
            </div>

            <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-primary" /> Required Meta permissions
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>whatsapp_business_management</li>
                <li>whatsapp_business_messaging</li>
                <li>pages_manage_posts, pages_read_engagement (for FB auto-post)</li>
                <li>System User access token from Meta Business Manager</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting} className="bg-primary">
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Submit to Meta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

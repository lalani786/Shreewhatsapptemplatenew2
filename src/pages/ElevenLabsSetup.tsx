import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mic,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

type StatusState =
  | { kind: "idle" }
  | { kind: "checking" }
  | {
      kind: "active";
      tier?: string;
      used: number;
      limit: number;
      remaining: number;
    }
  | { kind: "invalid"; message: string }
  | { kind: "missing" }
  | { kind: "error"; message: string };

function mask(key: string) {
  if (!key) return "";
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 6)}${"•".repeat(Math.max(4, key.length - 10))}${key.slice(-4)}`;
}

export default function ElevenLabsSetup() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<StatusState>({ kind: "idle" });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("api_credentials")
        .select("elevenlabs_api_key")
        .eq("user_id", user.id)
        .maybeSingle();

      const existing = (data as any)?.elevenlabs_api_key || "";
      setSavedKey(existing);
      setApiKey(existing);
      setLoading(false);
      // Auto-check on load
      void checkStatus(existing);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkStatus = async (keyOverride?: string) => {
    setStatus({ kind: "checking" });
    const { data, error } = await supabase.functions.invoke("elevenlabs-status", {
      body: { apiKey: keyOverride ?? apiKey },
    });

    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }
    if (!data) {
      setStatus({ kind: "error", message: "No response" });
      return;
    }

    if (data.status === "missing") {
      setStatus({ kind: "missing" });
    } else if (data.status === "active") {
      setStatus({
        kind: "active",
        tier: data.tier,
        used: data.characterCount,
        limit: data.characterLimit,
        remaining: data.charactersRemaining,
      });
    } else if (data.status === "invalid") {
      setStatus({ kind: "invalid", message: data.message || "Invalid API key" });
    } else {
      setStatus({ kind: "error", message: data.message || "Unknown error" });
    }
  };

  const handleSave = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      toast.error("Please enter an API key");
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not signed in");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("api_credentials")
      .upsert(
        { user_id: user.id, elevenlabs_api_key: trimmed },
        { onConflict: "user_id" }
      );

    if (error) {
      toast.error("Failed to save key");
      setSaving(false);
      return;
    }
    setSavedKey(trimmed);
    toast.success("API key saved");
    setSaving(false);
    void checkStatus(trimmed);
  };

  const renderStatus = () => {
    switch (status.kind) {
      case "idle":
        return <Badge variant="secondary">Unknown</Badge>;
      case "checking":
        return (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Checking...
          </Badge>
        );
      case "active":
        return (
          <Badge className="bg-success">
            <CheckCircle className="mr-1 h-3 w-3" />
            Active{status.tier ? ` · ${status.tier}` : ""}
          </Badge>
        );
      case "invalid":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Invalid key
          </Badge>
        );
      case "missing":
        return (
          <Badge variant="secondary">
            <AlertCircle className="mr-1 h-3 w-3" />
            Not configured
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Error
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const showActiveMeter = status.kind === "active" && status.limit > 0;
  const usagePct = showActiveMeter
    ? Math.min(100, Math.round(((status as any).used / (status as any).limit) * 100))
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ElevenLabs API</h1>
        <p className="text-muted-foreground">
          Configure your ElevenLabs key for voiceover and music generation
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              API Key
            </CardTitle>
            <CardDescription>
              Stored securely in your account. Used for text-to-speech and music.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="elevenlabs-key">ElevenLabs API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="elevenlabs-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk_..."
                  className="font-mono"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {savedKey && (
                <p className="text-xs text-muted-foreground font-mono">
                  Saved: {mask(savedKey)}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Key"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => checkStatus()}
                disabled={status.kind === "checking"}
              >
                {status.kind === "checking" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Status"
                )}
              </Button>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              {renderStatus()}
            </div>

            {(status.kind === "invalid" || status.kind === "error") && (
              <p className="text-sm text-destructive">{status.message}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage & Quota</CardTitle>
            <CardDescription>
              Character usage for your current ElevenLabs billing period
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {showActiveMeter ? (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Characters used</span>
                    <span className="font-medium">
                      {(status as any).used.toLocaleString()} /{" "}
                      {(status as any).limit.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(status as any).remaining.toLocaleString()} characters remaining
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Save and test a valid API key to see usage details.
              </p>
            )}

            <Button variant="outline" className="w-full" asChild>
              <a
                href="https://elevenlabs.io/app/settings/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Manage Keys at ElevenLabs
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

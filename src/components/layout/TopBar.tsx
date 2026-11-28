import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, Wifi, WifiOff, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface TopBarProps {
  onSignOut: () => void;
  isSigningOut: boolean;
}

export function TopBar({ onSignOut, isSigningOut }: TopBarProps) {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [apiActive, setApiActive] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email ?? null);
    };
    getUser();

    // Check API status
    const checkApiStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("api_credentials")
          .select("whatsapp_phone_id, whatsapp_access_token")
          .eq("user_id", user.id)
          .single();
        setApiActive(!!(data?.whatsapp_phone_id && data?.whatsapp_access_token));
      }
    };
    checkApiStatus();

    // Connection status
    const handleOnline = () => setIsConnected(true);
    const handleOffline = () => setIsConnected(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-4">
        <SidebarTrigger />
        <span className="text-sm text-muted-foreground">{userEmail}</span>
      </div>
      <div className="flex items-center gap-4">
        <Badge variant={isConnected ? "default" : "destructive"} className="gap-1.5">
          {isConnected ? (
            <>
              <Wifi className="h-3 w-3" />
              Connected
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3" />
              Disconnected
            </>
          )}
        </Badge>
        <Badge variant={apiActive ? "default" : "secondary"} className="gap-1.5">
          <Zap className="h-3 w-3" />
          API {apiActive ? "Active" : "Inactive"}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={onSignOut}
          disabled={isSigningOut}
          className="gap-2"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </header>
  );
}

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import Auth from "./pages/Auth";
import Messages from "./pages/Messages";
import Contacts from "./pages/Contacts";
import Broadcast from "./pages/Broadcast";
import Analytics from "./pages/Analytics";
import ApiSetup from "./pages/ApiSetup";
import AiTemplate from "./pages/AiTemplate";
import Preferences from "./pages/Preferences";
import SocialMedia from "./pages/SocialMedia";
import PhotoStudio from "./pages/PhotoStudio";
import ElevenLabsSetup from "./pages/ElevenLabsSetup";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // If this is a password recovery link, route directly to /auth with recovery state
  if (
    window.location.hash.includes("type=recovery") ||
    window.location.search.includes("type=recovery")
  ) {
    return <Navigate to={`/auth${window.location.search || ""}${window.location.hash || ""}`} replace />;
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/messages" replace />} />
            <Route path="messages" element={<Messages />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="broadcast" element={<Broadcast />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="api-setup" element={<ApiSetup />} />
            <Route path="ai-template" element={<AiTemplate />} />
            <Route path="preferences" element={<Preferences />} />
            <Route path="social-media" element={<SocialMedia />} />
            <Route path="photo-studio" element={<PhotoStudio />} />
            <Route path="elevenlabs-setup" element={<ElevenLabsSetup />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

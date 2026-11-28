import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare,
  Loader2,
  Sparkles,
  ShieldCheck,
  Zap,
  Share2,
  Video,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ArrowRight,
  KeyRound,
  ArrowLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { z } from "zod";
import { BrandLogo } from "@/components/ui/BrandLogo";

const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function Auth() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Password reset states
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSentSuccess, setResetSentSuccess] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    // Check if there was an OAuth error returned in the URL
    const hash = window.location.hash;
    const search = window.location.search;
    const urlParams = new URLSearchParams(search || (hash.startsWith("#") ? hash.substring(1) : ""));
    const errorDescription = urlParams.get("error_description");
    if (errorDescription) {
      toast.error(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
    }

    const isRecovery =
      urlParams.get("type") === "recovery" ||
      hash.includes("type=recovery") ||
      search.includes("type=recovery");

    if (isRecovery) {
      setIsRecoveryMode(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecoveryMode(true);
        return;
      }
      if (session && !isRecovery && !isRecoveryMode) {
        navigate("/messages");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !isRecovery && !isRecoveryMode) {
        navigate("/messages");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, isRecoveryMode]);

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      const redirectUrl = window.location.origin.includes("localhost")
        ? `${window.location.origin}/auth`
        : "https://shreetemplate.online/auth";

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        console.error("Google OAuth error:", error.message);
        const msg = error.message || (error as any)?.msg || "";
        if (
          msg.toLowerCase().includes("provider is not enabled") ||
          msg.toLowerCase().includes("unsupported provider")
        ) {
          toast.error("Google sign-in is not enabled in Supabase", {
            description: "Enable the Google provider in your Supabase dashboard under Authentication > Providers.",
            duration: 8000,
            action: {
              label: "Open Dashboard",
              onClick: () =>
                window.open(
                  "https://supabase.com/dashboard/project/nwkhkyscsyhunjnbhmqm/auth/providers",
                  "_blank"
                ),
            },
          });
        } else {
          toast.error(msg || "Failed to sign in with Google");
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "An unexpected error occurred during Google sign in");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const validateInputs = () => {
    try {
      emailSchema.parse(email);
    } catch {
      toast.error("Please enter a valid email address");
      return false;
    }
    try {
      passwordSchema.parse(password);
    } catch {
      toast.error("Password must be at least 6 characters");
      return false;
    }
    return true;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInputs()) return;

    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        toast.error("Invalid email or password");
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success("Signed in successfully!");
    }
    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInputs()) return;

    setIsLoading(true);
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });

    if (error) {
      if (error.message.includes("already registered")) {
        toast.error("This email is already registered. Please sign in instead.");
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success("Account created! You can now sign in.");
    }
    setIsLoading(false);
  };

  const handleSendPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(resetEmail);
    } catch {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSendingReset(true);
    try {
      const redirectUrl = `${window.location.origin}/auth?type=recovery`;
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: redirectUrl,
      });

      if (error) {
        toast.error(error.message);
      } else {
        setResetSentSuccess(true);
        toast.success("Password reset instructions sent to your email!");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to send reset link");
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      passwordSchema.parse(newPassword);
    } catch {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Password updated successfully! Welcome back.");
        setIsRecoveryMode(false);
        window.history.replaceState({}, document.title, window.location.pathname);
        navigate("/messages");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to update password");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-x-hidden bg-slate-950 text-slate-100">
      {/* Dynamic Ambient Background Glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-emerald-500/20 blur-[128px]" />
      <div className="pointer-events-none absolute top-1/2 -right-40 h-[550px] w-[550px] rounded-full bg-teal-500/15 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-[450px] w-[450px] rounded-full bg-emerald-600/10 blur-[130px]" />

      <div className="relative z-10 w-full max-w-6xl px-4 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Column: UI/UX Display & Product Feature Showcase */}
          <div className="lg:col-span-7 space-y-6 lg:pr-4">
            {/* Top Brand Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-medium text-emerald-400 backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              <span>Next-Gen WhatsApp & Social Media AI Automation</span>
            </div>

            {/* Main Headline */}
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
                Supercharge Your Marketing with{" "}
                <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-green-400 bg-clip-text text-transparent">
                  Shree AI Messenger
                </span>
              </h1>
              <p className="text-base sm:text-lg text-slate-400 max-w-xl leading-relaxed">
                Automate interactive WhatsApp campaigns, generate AI promo videos with synchronized voiceovers, and auto-publish content across social channels in seconds.
              </p>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 backdrop-blur-md">
                <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-400">
                  <Video className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">AI Promo Video Studio</h4>
                  <p className="text-xs text-slate-400">Ken Burns, NVIDIA Cosmos & Pexels video engine.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 backdrop-blur-md">
                <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-400">
                  <Share2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Multi-Channel Posting</h4>
                  <p className="text-xs text-slate-400">Directly sync to Instagram, YouTube, FB & LinkedIn.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 backdrop-blur-md">
                <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-400">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Official Cloud API</h4>
                  <p className="text-xs text-slate-400">Interactive quick-reply buttons and meta templates.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 backdrop-blur-md">
                <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-400">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Broadcast Automations</h4>
                  <p className="text-xs text-slate-400">High-deliverability broadcasts with real-time stats.</p>
                </div>
              </div>
            </div>

            {/* Interactive Live Preview Mock Showcase */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-4 shadow-xl backdrop-blur-lg">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-xs font-semibold text-emerald-400">AI Campaign Engine Active</span>
                </div>
                <span className="text-[11px] text-slate-400">99.8% Delivery Success</span>
              </div>
              <div className="pt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Meta Verified WhatsApp Business API Connected</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>ElevenLabs Neural Voices & AI Template Designer Ready</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Authentication Card Form */}
          <div className="lg:col-span-5 w-full flex justify-center">
            {isRecoveryMode ? (
              <Card className="w-full max-w-md border-slate-800 bg-slate-900/90 text-slate-100 shadow-2xl backdrop-blur-2xl">
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <KeyRound className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-2xl font-bold tracking-tight text-white">
                    Set New Password
                  </CardTitle>
                  <CardDescription className="text-slate-400 text-sm">
                    Enter and confirm your new password below.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-password" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        New Password (min 6 characters)
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <Input
                          id="new-password"
                          type={showNewPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="pl-9 pr-9 bg-slate-950/60 border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-emerald-500"
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirm-password" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Confirm New Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <Input
                          id="confirm-password"
                          type={showNewPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="pl-9 bg-slate-950/60 border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-emerald-500"
                          required
                          minLength={6}
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold shadow-lg shadow-emerald-500/20 h-10 transition-all duration-200"
                      disabled={isUpdatingPassword}
                    >
                      {isUpdatingPassword ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating password...
                        </>
                      ) : (
                        <>
                          Update Password
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setIsRecoveryMode(false);
                        window.history.replaceState({}, document.title, window.location.pathname);
                      }}
                      className="w-full text-slate-400 hover:text-white text-xs"
                    >
                      <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                      Back to Sign In
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <Card className="w-full max-w-md border-slate-800 bg-slate-900/90 text-slate-100 shadow-2xl backdrop-blur-2xl">
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-3">
                    <BrandLogo size="lg" showText={false} />
                  </div>
                  <CardTitle className="text-2xl font-bold tracking-tight text-white">
                    Welcome to Shree AI Messenger
                  </CardTitle>
                  <CardDescription className="text-slate-400 text-sm">
                    Sign in to manage your WhatsApp & marketing campaigns
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Google Authentication Button */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading || isGoogleLoading}
                    className="w-full bg-slate-950/70 hover:bg-slate-800/80 border-slate-700/80 hover:border-slate-600 text-white font-medium h-11 transition-all flex items-center justify-center gap-3 shadow-md hover:shadow-lg"
                  >
                    {isGoogleLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                        <span>Connecting to Google...</span>
                      </>
                    ) : (
                      <>
                        <GoogleIcon className="h-4 w-4 shrink-0" />
                        <span>Continue with Google</span>
                      </>
                    )}
                  </Button>

                  {/* Styled Divider */}
                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-slate-800" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-slate-900/90 px-3 text-slate-400 font-medium tracking-wider">
                        Or continue with email
                      </span>
                    </div>
                  </div>

                  <Tabs defaultValue="signin" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-slate-800/80 border border-slate-700/60 p-1">
                      <TabsTrigger
                        value="signin"
                        className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-slate-300 text-sm font-medium transition-all"
                      >
                        Sign In
                      </TabsTrigger>
                      <TabsTrigger
                        value="signup"
                        className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-slate-300 text-sm font-medium transition-all"
                      >
                        Create Account
                      </TabsTrigger>
                    </TabsList>

                    {/* Sign In Tab */}
                    <TabsContent value="signin" className="pt-3">
                      <form onSubmit={handleSignIn} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="signin-email" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                            Email Address
                          </Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input
                              id="signin-email"
                              type="email"
                              placeholder="name@company.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="pl-9 bg-slate-950/60 border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-emerald-500"
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="signin-password" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                              Password
                            </Label>
                            <button
                              type="button"
                              onClick={() => {
                                setResetEmail(email);
                                setResetSentSuccess(false);
                                setIsResetDialogOpen(true);
                              }}
                              className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium hover:underline"
                            >
                              Forgot password?
                            </button>
                          </div>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input
                              id="signin-password"
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="pl-9 pr-9 bg-slate-950/60 border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-emerald-500"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        <Button
                          type="submit"
                          className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold shadow-lg shadow-emerald-500/20 h-10 transition-all duration-200"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Signing in...
                            </>
                          ) : (
                            <>
                              Sign In
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                          )}
                        </Button>
                      </form>
                    </TabsContent>

                    {/* Sign Up Tab */}
                    <TabsContent value="signup" className="pt-3">
                      <form onSubmit={handleSignUp} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="signup-email" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                            Email Address
                          </Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input
                              id="signup-email"
                              type="email"
                              placeholder="name@company.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="pl-9 bg-slate-950/60 border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-emerald-500"
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="signup-password" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                            Password (min 6 characters)
                          </Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input
                              id="signup-password"
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="pl-9 pr-9 bg-slate-950/60 border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-emerald-500"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        <Button
                          type="submit"
                          className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold shadow-lg shadow-emerald-500/20 h-10 transition-all duration-200"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Creating account...
                            </>
                          ) : (
                            <>
                              Create Account
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                          )}
                        </Button>
                      </form>
                    </TabsContent>
                  </Tabs>

                  {/* Security Footer Badge */}
                  <div className="pt-2 flex items-center justify-center gap-1.5 text-xs text-slate-400">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>256-bit SSL encrypted • Secure Supabase Auth</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

        </div>
      </div>

      {/* Password Reset Request Dialog */}
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 shadow-2xl">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <KeyRound className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-center text-white">
              Reset Your Password
            </DialogTitle>
            <DialogDescription className="text-center text-slate-400 text-sm">
              Enter your registered email address and we&apos;ll send you a password reset link.
            </DialogDescription>
          </DialogHeader>

          {resetSentSuccess ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-semibold text-emerald-300">Reset Link Sent!</h4>
                <p className="text-xs text-slate-300">
                  We&apos;ve sent an email to <span className="font-semibold text-white">{resetEmail}</span> with instructions to reset your password. Please check your inbox and spam folder.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => {
                  setIsResetDialogOpen(false);
                  setResetSentSuccess(false);
                }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white"
              >
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSendPasswordReset} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="name@company.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="pl-9 bg-slate-950/60 border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsResetDialogOpen(false)}
                  className="w-1/2 border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-300"
                  disabled={isSendingReset}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSendingReset}
                  className="w-1/2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium shadow-md shadow-emerald-500/20"
                >
                  {isSendingReset ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sliders, Moon, Sun, Globe, Building, Bell, Save } from "lucide-react";
import { toast } from "sonner";

export default function Preferences() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [preferences, setPreferences] = useState({
    language: "en",
    brandName: "",
    notifications: true,
  });

  useEffect(() => {
    // Load preferences from localStorage
    const savedPrefs = localStorage.getItem("shree-whatsapp-prefs");
    if (savedPrefs) {
      const parsed = JSON.parse(savedPrefs);
      setPreferences(parsed);
    }

    // Check system/saved theme
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = savedTheme === "dark" || (!savedTheme && prefersDark);
    setIsDarkMode(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const handleThemeToggle = (checked: boolean) => {
    setIsDarkMode(checked);
    document.documentElement.classList.toggle("dark", checked);
    localStorage.setItem("theme", checked ? "dark" : "light");
    toast.success(`${checked ? "Dark" : "Light"} mode enabled`);
  };

  const handleSave = () => {
    localStorage.setItem("shree-whatsapp-prefs", JSON.stringify(preferences));
    toast.success("Preferences saved!");
  };

  const languages = [
    { code: "en", name: "English" },
    { code: "hi", name: "Hindi" },
    { code: "mr", name: "Marathi" },
    { code: "gu", name: "Gujarati" },
    { code: "ta", name: "Tamil" },
    { code: "te", name: "Telugu" },
    { code: "bn", name: "Bengali" },
    { code: "kn", name: "Kannada" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Preferences</h1>
        <p className="text-muted-foreground">Customize your application settings</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isDarkMode ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              Appearance
            </CardTitle>
            <CardDescription>
              Customize how the application looks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Dark Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Toggle between light and dark themes
                </p>
              </div>
              <Switch checked={isDarkMode} onCheckedChange={handleThemeToggle} />
            </div>
          </CardContent>
        </Card>

        {/* Language */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Language
            </CardTitle>
            <CardDescription>
              Set your preferred language for AI-generated content
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Preferred Language</Label>
              <Select
                value={preferences.language}
                onValueChange={(value) =>
                  setPreferences({ ...preferences, language: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Brand Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Brand Settings
            </CardTitle>
            <CardDescription>
              Set your default brand information for templates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brand-name">Default Brand Name</Label>
              <Input
                id="brand-name"
                value={preferences.brandName}
                onChange={(e) =>
                  setPreferences({ ...preferences, brandName: e.target.value })
                }
                placeholder="Your Business Name"
              />
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>
              Configure notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Get notified about message deliveries and campaigns
                </p>
              </div>
              <Switch
                checked={preferences.notifications}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, notifications: checked })
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Button onClick={handleSave} size="lg">
        <Save className="mr-2 h-4 w-4" />
        Save Preferences
      </Button>
    </div>
  );
}

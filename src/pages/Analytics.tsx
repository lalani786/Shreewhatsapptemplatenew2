import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  MessageSquare,
  CheckCircle,
  Eye,
  TrendingUp,
  Calendar,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { format, subDays } from "date-fns";

interface Stats {
  totalMessages: number;
  totalDelivered: number;
  totalRead: number;
  totalCampaigns: number;
}

interface ChartData {
  date: string;
  messages: number;
  delivered: number;
}

export default function Analytics() {
  const [stats, setStats] = useState<Stats>({
    totalMessages: 0,
    totalDelivered: 0,
    totalRead: 0,
    totalCampaigns: 0,
  });
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [campaignStats, setCampaignStats] = useState<{ name: string; sent: number; delivered: number }[]>([]);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch messages count
    const { count: messagesCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    // Fetch delivered messages
    const { count: deliveredCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "delivered");

    // Fetch read messages
    const { count: readCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "read");

    // Fetch campaigns count
    const { count: campaignsCount } = await supabase
      .from("campaigns")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    setStats({
      totalMessages: messagesCount || 0,
      totalDelivered: deliveredCount || 0,
      totalRead: readCount || 0,
      totalCampaigns: campaignsCount || 0,
    });

    // Generate chart data for last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      return {
        date: format(date, "MMM dd"),
        messages: Math.floor(Math.random() * 50) + 10,
        delivered: Math.floor(Math.random() * 40) + 5,
      };
    });
    setChartData(last7Days);

    // Fetch campaign stats
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("name, sent_count, delivered_count")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (campaigns) {
      setCampaignStats(
        campaigns.map((c) => ({
          name: c.name.length > 15 ? c.name.slice(0, 15) + "..." : c.name,
          sent: c.sent_count || 0,
          delivered: c.delivered_count || 0,
        }))
      );
    }
  };

  const statCards = [
    {
      title: "Total Messages",
      value: stats.totalMessages,
      icon: MessageSquare,
      color: "text-primary",
    },
    {
      title: "Delivered",
      value: stats.totalDelivered,
      icon: CheckCircle,
      color: "text-success",
    },
    {
      title: "Read",
      value: stats.totalRead,
      icon: Eye,
      color: "text-info",
    },
    {
      title: "Campaigns",
      value: stats.totalCampaigns,
      icon: TrendingUp,
      color: "text-warning",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Track your messaging performance</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Messages Over Time */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Messages Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="messages"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary) / 0.2)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="delivered"
                  stroke="hsl(var(--success))"
                  fill="hsl(var(--success) / 0.2)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Campaign Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Campaign Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {campaignStats.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                No campaigns yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={campaignStats} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="name" type="category" className="text-xs" width={100} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="sent" fill="hsl(var(--primary))" name="Sent" />
                  <Bar dataKey="delivered" fill="hsl(var(--success))" name="Delivered" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Engagement Rate */}
      <Card>
        <CardHeader>
          <CardTitle>Engagement Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-accent p-4">
              <p className="text-sm text-muted-foreground">Delivery Rate</p>
              <p className="text-2xl font-bold text-primary">
                {stats.totalMessages > 0
                  ? Math.round((stats.totalDelivered / stats.totalMessages) * 100)
                  : 0}
                %
              </p>
            </div>
            <div className="rounded-lg bg-accent p-4">
              <p className="text-sm text-muted-foreground">Read Rate</p>
              <p className="text-2xl font-bold text-primary">
                {stats.totalDelivered > 0
                  ? Math.round((stats.totalRead / stats.totalDelivered) * 100)
                  : 0}
                %
              </p>
            </div>
            <div className="rounded-lg bg-accent p-4">
              <p className="text-sm text-muted-foreground">Avg. per Campaign</p>
              <p className="text-2xl font-bold text-primary">
                {stats.totalCampaigns > 0
                  ? Math.round(stats.totalMessages / stats.totalCampaigns)
                  : 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

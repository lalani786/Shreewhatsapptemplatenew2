import { useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  History,
  CheckCircle,
  Loader2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Send,
  Eye,
  MessageSquare,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface Campaign {
  id: string;
  name: string;
  message_content: string;
  status: string;
  sent_count: number | null;
  delivered_count: number | null;
  read_count: number | null;
  created_at: string;
  contact_ids: string[] | null;
  scheduled_at: string | null;
}

interface CampaignHistoryProps {
  campaigns: Campaign[];
  onCampaignCancelled?: () => void;
}

export function CampaignHistory({ campaigns, onCampaignCancelled }: CampaignHistoryProps) {
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancelCampaign = async (campaignId: string, campaignName: string) => {
    setCancellingId(campaignId);
    try {
      const { error } = await supabase
        .from("campaigns")
        .update({ status: "cancelled" })
        .eq("id", campaignId);

      if (error) {
        console.error("Cancel error:", error);
        toast.error("Failed to cancel campaign");
      } else {
        toast.success(`Campaign "${campaignName}" cancelled`);
        onCampaignCancelled?.();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error("Failed to cancel campaign");
    }
    setCancellingId(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return (
          <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
            <CheckCircle className="mr-1 h-3 w-3" />
            Sent
          </Badge>
        );
      case "sending":
        return (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Sending
          </Badge>
        );
      case "partial":
        return (
          <Badge variant="destructive">
            <AlertCircle className="mr-1 h-3 w-3" />
            Partial
          </Badge>
        );
      case "scheduled":
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" />
            Scheduled
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <XCircle className="mr-1 h-3 w-3" />
            Cancelled
          </Badge>
        );
      case "draft":
        return (
          <Badge variant="outline">
            <MessageSquare className="mr-1 h-3 w-3" />
            Draft
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDeliveryRate = (sent: number | null, delivered: number | null) => {
    if (!sent || sent === 0) return "0%";
    const rate = ((delivered || 0) / sent) * 100;
    return `${rate.toFixed(0)}%`;
  };

  const getReadRate = (delivered: number | null, read: number | null) => {
    if (!delivered || delivered === 0) return "0%";
    const rate = ((read || 0) / delivered) * 100;
    return `${rate.toFixed(0)}%`;
  };

  const toggleExpanded = (campaignId: string) => {
    setExpandedCampaign((prev) => (prev === campaignId ? null : campaignId));
  };

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Campaign History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <History className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No campaigns sent yet</p>
            <p className="text-sm text-muted-foreground/70">
              Create your first campaign above to get started
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Campaign History
          <Badge variant="secondary" className="ml-2">
            {campaigns.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Send className="h-3 w-3" />
                    Sent
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Delivered
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Eye className="h-3 w-3" />
                    Read
                  </div>
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <Collapsible
                  key={campaign.id}
                  open={expandedCampaign === campaign.id}
                  onOpenChange={() => toggleExpanded(campaign.id)}
                  asChild
                >
                  <>
                    <CollapsibleTrigger asChild>
                      <TableRow className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            {expandedCampaign === campaign.id ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{campaign.name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {campaign.contact_ids?.length || 0} recipients
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                        <TableCell className="text-center font-medium">
                          {campaign.sent_count || 0}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center">
                            <span className="font-medium">{campaign.delivered_count || 0}</span>
                            <span className="text-xs text-muted-foreground">
                              {getDeliveryRate(campaign.sent_count, campaign.delivered_count)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center">
                            <span className="font-medium">{campaign.read_count || 0}</span>
                            <span className="text-xs text-muted-foreground">
                              {getReadRate(campaign.delivered_count, campaign.read_count)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {campaign.status === "scheduled" && campaign.scheduled_at ? (
                              <>
                                <p className="text-xs text-muted-foreground">Scheduled for</p>
                                <p className="font-medium">{format(new Date(campaign.scheduled_at), "MMM d, yyyy")}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(campaign.scheduled_at), "h:mm a")}
                                </p>
                              </>
                            ) : (
                              <>
                                <p>{format(new Date(campaign.created_at), "MMM d, yyyy")}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(campaign.created_at), "h:mm a")}
                                </p>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {campaign.status === "scheduled" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  disabled={cancellingId === campaign.id}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {cancellingId === campaign.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <XCircle className="h-4 w-4" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Cancel scheduled campaign?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will cancel "{campaign.name}" scheduled for{" "}
                                    {campaign.scheduled_at && format(new Date(campaign.scheduled_at), "PPp")}.
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Keep scheduled</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleCancelCampaign(campaign.id, campaign.name)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Cancel campaign
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </TableCell>
                      </TableRow>
                    </CollapsibleTrigger>
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={8}>
                          <div className="py-3 px-4 space-y-3">
                            <div>
                              <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                Message Content
                              </h4>
                              <div className="bg-background rounded-lg border p-3">
                                <p className="text-sm whitespace-pre-wrap">
                                  {campaign.message_content}
                                </p>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="bg-background rounded-lg border p-3 text-center">
                                <p className="text-2xl font-bold text-primary">
                                  {campaign.sent_count || 0}
                                </p>
                                <p className="text-xs text-muted-foreground">Messages Sent</p>
                              </div>
                              <div className="bg-background rounded-lg border p-3 text-center">
                                <p className="text-2xl font-bold text-primary">
                                  {getDeliveryRate(campaign.sent_count, campaign.delivered_count)}
                                </p>
                                <p className="text-xs text-muted-foreground">Delivery Rate</p>
                              </div>
                              <div className="bg-background rounded-lg border p-3 text-center">
                                <p className="text-2xl font-bold text-primary">
                                  {getReadRate(campaign.delivered_count, campaign.read_count)}
                                </p>
                                <p className="text-xs text-muted-foreground">Read Rate</p>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

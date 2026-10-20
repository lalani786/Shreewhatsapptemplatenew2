import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Sparkles, Search, Check, CheckCheck, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { MediaAttachment } from "@/components/messages/MediaAttachment";

interface Contact {
  id: string;
  name: string;
  phone: string;
}

interface Message {
  id: string;
  content: string;
  direction: string;
  status: string;
  created_at: string;
  message_type?: string;
}

interface Template {
  id: string;
  name: string;
  content: string;
  image_prompt?: string;
}

export default function Messages() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchContacts();
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (selectedContact) {
      fetchMessages(selectedContact.id);
      
      const channel = supabase
        .channel(`messages-${selectedContact.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `contact_id=eq.${selectedContact.id}`,
          },
          (payload) => {
            setMessages((prev) => [...prev, payload.new as Message]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedContact]);

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from("templates")
      .select("id, name, content, image_prompt")
      .order("created_at", { ascending: false });
    if (data) setTemplates(data);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchContacts = async () => {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, name, phone")
      .order("name");
    
    if (error) {
      toast.error("Failed to load contacts");
    } else {
      setContacts(data || []);
    }
  };

  const fetchMessages = async (contactId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true });
    
    if (error) {
      toast.error("Failed to load messages");
    } else {
      setMessages(data || []);
    }
  };

  const [isSending, setIsSending] = useState(false);

  const handleSendMessage = async (imageUrl?: string, caption?: string) => {
    const messageToSend = imageUrl ? (caption || "Image") : newMessage.trim();
    if (!messageToSend || !selectedContact || isSending) return;

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          contactId: selectedContact.id,
          message: messageToSend,
          messageType: imageUrl ? "image" : "text",
          imageUrl: imageUrl,
        },
      });

      if (error) {
        console.error("Send error:", error);
        toast.error("Failed to send message");
      } else if (data?.error) {
        console.error("API error:", data.error);
        toast.error(data.error);
      } else {
        setNewMessage("");
        setPendingImage(null);
        toast.success(imageUrl ? "Image sent via WhatsApp!" : "Message sent via WhatsApp!");
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error("Failed to send message");
    }
    setIsSending(false);
  };

  const handleTemplateSelect = (template: Template) => {
    setNewMessage(template.content);
    toast.success(`Template "${template.name}" loaded`);
  };

  const handleImageSelect = (imageUrl: string, caption?: string) => {
    handleSendMessage(imageUrl, caption);
  };

  const handleGenerateSuggestion = async () => {
    if (!selectedContact) return;
    
    setIsGenerating(true);
    try {
      const response = await supabase.functions.invoke("generate-template", {
        body: {
          type: "message_suggestion",
          context: {
            contactName: selectedContact.name,
            recentMessages: messages.slice(-5).map((m) => m.content),
          },
        },
      });

      if (response.error) throw response.error;
      setNewMessage(response.data.content);
      toast.success("AI suggestion generated!");
    } catch {
      toast.error("Failed to generate suggestion");
    }
    setIsGenerating(false);
  };

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered":
        return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
      case "read":
        return <CheckCheck className="h-3 w-3 text-primary" />;
      default:
        return <Check className="h-3 w-3 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      {/* Contacts List */}
      <Card className="w-80 flex-shrink-0">
        <div className="border-b p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <ScrollArea className="h-[calc(100%-4.5rem)]">
          {filteredContacts.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No contacts found. Add contacts first.
            </div>
          ) : (
            filteredContacts.map((contact) => (
              <div
                key={contact.id}
                onClick={() => setSelectedContact(contact)}
                className={`flex cursor-pointer items-center gap-3 border-b p-4 transition-colors hover:bg-accent ${
                  selectedContact?.id === contact.id ? "bg-accent" : ""
                }`}
              >
                <Avatar>
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {contact.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-sm text-muted-foreground">{contact.phone}</p>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </Card>

      {/* Chat Area */}
      <Card className="flex flex-1 flex-col">
        {selectedContact ? (
          <>
            <div className="flex items-center gap-3 border-b p-4">
              <Avatar>
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {selectedContact.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{selectedContact.name}</p>
                <p className="text-sm text-muted-foreground">{selectedContact.phone}</p>
              </div>
            </div>
            <ScrollArea className="flex-1 p-4 chat-scrollbar">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.direction === "outgoing" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                        message.direction === "outgoing"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {message.message_type === "image" && (
                        <div className="flex items-center gap-2 mb-1">
                          <ImageIcon className="h-4 w-4" />
                          <span className="text-xs">Image</span>
                        </div>
                      )}
                      <p>{message.content}</p>
                      <div className="mt-1 flex items-center justify-end gap-1">
                        <span className="text-xs opacity-70">
                          {format(new Date(message.created_at), "HH:mm")}
                        </span>
                        {message.direction === "outgoing" && getStatusIcon(message.status)}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="flex gap-2 border-t p-4">
              <MediaAttachment
                templates={templates}
                onSelectTemplate={handleTemplateSelect}
                onImageSelect={handleImageSelect}
                disabled={isSending}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleGenerateSuggestion}
                disabled={isGenerating}
                title="AI Suggestion"
              >
                <Sparkles className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
              </Button>
              <Input
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <Button onClick={() => handleSendMessage()} disabled={!newMessage.trim() || isSending}>
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            Select a contact to start messaging
          </div>
        )}
      </Card>
    </div>
  );
}

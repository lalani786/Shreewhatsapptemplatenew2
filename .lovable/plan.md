

# Shree WhatsApp - Marketing Dashboard

A professional WhatsApp Business marketing platform powered by Google Gemini AI for generating marketing templates and promotional images.

---

## 1. Application Layout & Navigation

**Sidebar Navigation (Left)**
- Messages, Contacts, Broadcast, Analytics, API Setup, AI Template API, Preferences
- WhatsApp-style green accent design with icons
- Collapsible sidebar for more screen space

**Top Bar**
- Display email: najir734@gmail.com
- Connection status indicator (Connected/Disconnected)
- API Status indicator (Active/Inactive)
- Sign Out button

---

## 2. Authentication & User Access

**Login/Signup System**
- Email and password authentication via Supabase
- Secure session management
- Protected routes requiring authentication
- Redirect to login for unauthenticated users

---

## 3. Messages Page

**WhatsApp-Style Chat Interface**
- Left panel: Contact list with search
- Right panel: Chat conversation view
- Message types: Text, Image, and Template messages
- AI Suggestion button to generate message templates using Gemini
- Send button with delivery status indicators
- Message history stored in database

---

## 4. Contacts Page

**Contact Management**
- Add, edit, and delete customer contacts
- Contact fields: Name, Phone, Email, Tags, Notes
- CSV import functionality for bulk contacts
- Search and filter contacts
- Contact grouping for targeted campaigns

---

## 5. Broadcast Page

**Bulk Campaign Manager**
- Multi-select contacts for campaigns
- Campaign name and scheduling
- Choose AI-generated templates or custom messages
- Send bulk WhatsApp campaigns
- Campaign history and status tracking

---

## 6. Analytics Page

**Performance Dashboard**
- Message statistics: Sent, Delivered, Read counts
- Visual charts showing campaign performance over time
- Campaign comparison metrics
- Engagement rate tracking
- Recent activity log

---

## 7. API Setup Page

**Credentials Configuration**
- WhatsApp Business API section:
  - Phone Number ID input
  - Access Token input (securely stored)
  - API version selector
- Connection test button with status feedback
- Instructions for obtaining API credentials

---

## 8. AI Template API Page (Core AI Feature)

**Marketing Template Generator**
- Input form:
  - Business Type dropdown
  - Product Category input
  - Discount Percentage slider
  - Festival/Occasion selector (Indian festivals included)
  - Custom prompt field
- Generate Template button
- AI-generated outputs:
  - WhatsApp message template (editable)
  - Promotional poster image description
  - Image generation using Gemini
- Save template to library
- Copy to clipboard functionality

---

## 9. Preferences Page

**Application Settings**
- Theme toggle: Light/Dark mode
- Language preference dropdown
- Default brand name input
- Logo upload (stored locally)
- Notification preferences

---

## 10. Database Structure (Supabase)

**Tables to create:**
- `contacts` - Customer contact information
- `messages` - Message history and status
- `campaigns` - Broadcast campaign data
- `templates` - Saved AI-generated templates
- `api_credentials` - Encrypted API keys storage
- `analytics_events` - Message delivery events

---

## 11. AI Integration (Lovable Cloud + Gemini)

**Real AI Features:**
- Edge function for Gemini API calls
- Template generation optimized for Indian marketing
- Festival-specific promotional content
- Image prompt generation for posters
- Message suggestions in chat

---

## 12. Design System

**Visual Style:**
- WhatsApp green (#25D366) as primary accent
- Clean, modern SaaS dashboard aesthetic
- Card-based layouts for data
- Responsive design for all screen sizes
- Professional business dashboard appearance


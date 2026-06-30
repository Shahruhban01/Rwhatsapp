# Product Requirements Document
# WhatsApp-Like Personal Messaging Application

**Version:** 1.0.0  
**Date:** June 30, 2026  
**Status:** Draft – Implementation Ready  
**Authors:** Senior PM / Senior Architect / Tech Lead  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision](#2-product-vision)
3. [Goals and Non-Goals](#3-goals-and-non-goals)
4. [Personas](#4-personas)
5. [Functional Requirements](#5-functional-requirements)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [User Stories](#7-user-stories)
8. [User Flows](#8-user-flows)
9. [System Architecture](#9-system-architecture)
10. [Firestore Design](#10-firestore-design)
11. [Realtime Database Design](#11-realtime-database-design)
12. [Storage Design (Cloudflare R2)](#12-storage-design-cloudflare-r2)
13. [API Design](#13-api-design)
14. [Authentication Design](#14-authentication-design)
15. [QR Login Design](#15-qr-login-design)
16. [Push Notification Design](#16-push-notification-design)
17. [Flutter Architecture](#17-flutter-architecture)
18. [React Architecture](#18-react-architecture)
19. [UI/UX Requirements](#19-uiux-requirements)
20. [Security Considerations](#20-security-considerations)
21. [Edge Cases](#21-edge-cases)
22. [Error Handling](#22-error-handling)
23. [Future Roadmap (Phase 2)](#23-future-roadmap-phase-2)
24. [Development Milestones](#24-development-milestones)
25. [Testing Strategy](#25-testing-strategy)
26. [Acceptance Criteria](#26-acceptance-criteria)

---

## 1. Executive Summary

This document defines the complete product and technical requirements for a personal, WhatsApp-like messaging application built on modern cloud infrastructure. The application replicates the core WhatsApp experience — real-time messaging, rich media sharing, groups, stories, presence indicators, and QR-based web login — without requiring enterprise-scale security overhead, since it is intended for personal use only.

The platform consists of three components:

- **Flutter mobile application** (Android-primary, iOS-ready) providing a native WhatsApp-like experience.
- **React web application** (Vite + Tailwind) replicating WhatsApp Web, accessible via QR login from the mobile app.
- **Node.js/Express backend** on Vercel handling authentication, business logic, media upload orchestration, push notifications, and QR sessions.

Firebase Firestore serves as the primary persistent database, while Firebase Realtime Database handles ephemeral presence and typing state. Cloudflare R2 stores all media. Firebase Cloud Messaging (FCM) delivers push notifications. Real-time message delivery relies exclusively on Firestore listeners — no custom WebSocket server or Socket.IO is required.

This PRD is the single source of truth for all development. Developers and AI coding agents should be able to implement the full system using this document alone without requiring major architectural decisions.

---

## 2. Product Vision

### 2.1 Vision Statement

To build a high-quality, fully functional WhatsApp clone for personal use that offers a seamless, near-identical user experience to WhatsApp across both mobile and web, powered by modern serverless cloud infrastructure that is maintainable, cost-effective, and extensible.

### 2.2 Core Principles

| Principle | Description |
|---|---|
| **Familiar UX** | Users who know WhatsApp should feel immediately at home |
| **Real-Time First** | Messages, presence, typing, and read receipts update instantly |
| **Cloud Native** | No self-hosted servers; all infrastructure is managed |
| **Simplicity** | Authentication is intentionally simple (single access key) |
| **Offline Ready** | Mobile app caches messages and queues sends when offline |
| **Extensible** | Architecture supports Phase 2 features without re-platforming |

### 2.3 Success Metrics

- Message delivery latency < 500ms under normal network conditions
- QR login flow completes < 5 seconds
- Story expiry within 1 minute of 24-hour mark
- Media upload time < 3 seconds for images under 5 MB
- App startup time < 2 seconds on mid-range Android devices
- Offline message queue drains within 3 seconds of reconnection

---

## 3. Goals and Non-Goals

### 3.1 Goals (Phase 1)

1. Full one-to-one and group text messaging with rich media (images, video, voice notes, documents, GIFs, stickers)
2. WhatsApp-like message features: reply, react, forward, copy, edit, delete for me / everyone, pin, star
3. Chat-level features: archive, pin, mute, delete, clear, wallpaper, media gallery
4. Presence system: online/offline, last seen, typing indicator, audio recording indicator
5. Stories / Status: text, image, video stories that expire after 24 hours, with views and replies
6. Groups: create, manage, invite link, admin controls, member management
7. QR Login: web app authenticates by scanning QR from mobile, exactly like WhatsApp Web
8. Push notifications via FCM for all message types and mentions
9. Privacy controls: block/unblock, hide last seen, read receipt toggle, story privacy
10. Profiles with photo, name, username, about
11. Global and per-chat search
12. Theme (light/dark), notification settings, storage management in settings
13. Device session management and logout-all-devices

### 3.2 Non-Goals (Phase 1)

1. Voice or video calls (Phase 2)
2. End-to-end encryption (Phase 2)
3. Phone number or email verification
4. OTP-based login
5. Public user registration / open sign-up
6. Enterprise security hardening
7. Multi-language / localization
8. Screen sharing (Phase 2)
9. AI assistant integration (Phase 2)
10. Scheduled messages (Phase 2)
11. Message translation (Phase 2)
12. Communities or Channels (Phase 2)
13. Payment integration
14. Third-party integrations or bots

---

## 4. Personas

### 4.1 Primary Persona: The Personal User

**Name:** Alex  
**Age:** 28  
**Context:** Using this application personally among a small, known group of friends and family. Alex is technically capable and set up the application. Expectations are high — the app should look and feel like WhatsApp.

**Goals:**
- Send and receive messages instantly
- Share photos, videos, and voice notes
- Know when others are online or have read a message
- Check stories from contacts
- Use the web version on a laptop without carrying a phone

**Pain Points:**
- Slow media loading
- Missing read receipts or presence
- QR sessions expiring too quickly
- Notifications not arriving when the app is in background

### 4.2 Secondary Persona: The Web User

**Name:** Jordan  
**Age:** 32  
**Context:** Prefers the desktop for longer conversations. Scans the QR code from their phone to use the web app during work hours.

**Goals:**
- Keyboard-first messaging on desktop
- Identical message history visible on both platforms
- Media preview and download on the web
- Unread badge in browser tab

**Pain Points:**
- QR sessions not persisting across browser refresh
- Missing notifications when focused on another browser tab
- Large file previews that slow the page

---

## 5. Functional Requirements

### 5.1 Authentication

| ID | Requirement |
|---|---|
| AUTH-01 | User logs in using a pre-shared Access Key (single static secret) |
| AUTH-02 | Backend validates the Access Key and returns a JWT (access token, 15-minute expiry) and Refresh Token (30-day expiry) |
| AUTH-03 | JWT is included in all API requests via `Authorization: Bearer <token>` header |
| AUTH-04 | Refresh Token is used to silently obtain a new JWT when it expires |
| AUTH-05 | Auto Login: on app launch, if a valid Refresh Token exists, silently re-authenticate |
| AUTH-06 | Logout clears tokens and local session on the current device |
| AUTH-07 | Logout All Devices invalidates all Refresh Tokens for the user across all sessions |
| AUTH-08 | Device sessions are tracked in Firestore with device name, platform, last active timestamp |
| AUTH-09 | QR Login allows the web app to authenticate by having the mobile app scan a QR code |
| AUTH-10 | Access Key is stored as an environment variable on the backend; it never appears in client code |

### 5.2 Messaging

| ID | Requirement |
|---|---|
| MSG-01 | Send and receive text messages in one-to-one chats |
| MSG-02 | Send and receive text messages in group chats |
| MSG-03 | Send images (JPEG, PNG, WebP, GIF) |
| MSG-04 | Send videos (MP4, MOV up to 100 MB) |
| MSG-05 | Send voice notes (recorded in-app, OGG/MP3) |
| MSG-06 | Send documents (PDF, DOCX, XLSX, ZIP, etc., up to 100 MB) |
| MSG-07 | Send audio files |
| MSG-08 | Send animated GIFs |
| MSG-09 | Send stickers |
| MSG-10 | Send emoji (native device/OS emoji picker) |
| MSG-11 | Reply to a specific message (inline reply with quoted preview) |
| MSG-12 | React to a message with an emoji |
| MSG-13 | Forward a message to another chat or contact |
| MSG-14 | Copy message text to clipboard |
| MSG-15 | Edit a sent text message (within 15 minutes of sending) |
| MSG-16 | Delete a message for me only |
| MSG-17 | Delete a message for everyone (within 60 minutes of sending) |
| MSG-18 | Pin a message in the chat (visible at the top of the chat) |
| MSG-19 | Star a message (accessible from starred messages list) |
| MSG-20 | Share a message externally via system share sheet |
| MSG-21 | Search messages within a chat |
| MSG-22 | View message info: delivered to / read by with timestamps |
| MSG-23 | Display timestamps on each message |
| MSG-24 | Display delivery status icons (sent ✓, delivered ✓✓, read ✓✓ in blue) |
| MSG-25 | Media messages show a thumbnail with download progress indicator |
| MSG-26 | Long-press on a message to open the context action menu |
| MSG-27 | Multi-select messages for bulk delete or forward |

### 5.3 Chat Features

| ID | Requirement |
|---|---|
| CHAT-01 | Archive a chat (moves to archived section, hidden from main list) |
| CHAT-02 | Pin up to 3 chats at the top of the chat list |
| CHAT-03 | Mute a chat (no push notifications) with duration options: 8 hours, 1 week, always |
| CHAT-04 | Delete a chat (removes from list, optionally deletes all messages) |
| CHAT-05 | Clear chat history (removes all messages but keeps the chat) |
| CHAT-06 | Export chat as a text file |
| CHAT-07 | Set a custom wallpaper for each chat |
| CHAT-08 | View media gallery: all images and videos shared in a chat |
| CHAT-09 | Unread message badge on each chat row in the list |
| CHAT-10 | Show last message preview and timestamp in chat list |
| CHAT-11 | Search chats in the main chat list |

### 5.4 Presence

| ID | Requirement |
|---|---|
| PRES-01 | Show "Online" when a user has the app open and active |
| PRES-02 | Show "Last seen [time]" when a user is offline |
| PRES-03 | Show "Typing..." indicator in chat when the other user is composing |
| PRES-04 | Show "Recording audio..." indicator when the other user records a voice note |
| PRES-05 | Update presence in real-time (< 2 second latency) |
| PRES-06 | Respect privacy settings: hide last seen / hide online if the user has toggled these off |
| PRES-07 | Delivery status updates in real-time without manual refresh |

### 5.5 Groups

| ID | Requirement |
|---|---|
| GRP-01 | Create a group with a name, optional photo, and initial member list |
| GRP-02 | Edit group name and description |
| GRP-03 | Change group photo |
| GRP-04 | Assign Admin role to any member |
| GRP-05 | Remove Admin role from a member |
| GRP-06 | Add members to the group (admin only) |
| GRP-07 | Remove members from the group (admin only) |
| GRP-08 | Leave the group |
| GRP-09 | Generate an invite link for the group |
| GRP-10 | Join a group via invite link |
| GRP-11 | Show group info screen with members list, description, media gallery |
| GRP-12 | Show group message delivery status per member |
| GRP-13 | Mention members with @username in group chats |
| GRP-14 | Receive notifications specifically for @mentions even if chat is muted |

### 5.6 Stories / Status

| ID | Requirement |
|---|---|
| STORY-01 | Post a text story with a colored background |
| STORY-02 | Post an image story |
| STORY-03 | Post a video story (up to 30 seconds) |
| STORY-04 | Stories automatically expire 24 hours after posting |
| STORY-05 | View stories from contacts in a dedicated stories tab |
| STORY-06 | Track who has viewed each story |
| STORY-07 | Reply to a story (sends a direct message to the poster) |
| STORY-08 | Delete a story before expiry |
| STORY-09 | Multiple stories per user are shown in sequence |
| STORY-10 | Optionally show story views as a push notification |
| STORY-11 | Story privacy: visible to all contacts, or custom list |

### 5.7 Profile

| ID | Requirement |
|---|---|
| PROF-01 | Set and update display name |
| PROF-02 | Set and update username (unique, lowercase, alphanumeric + underscore) |
| PROF-03 | Set and update "About" bio text |
| PROF-04 | Upload and update profile photo |
| PROF-05 | View another user's profile from within a chat |
| PROF-06 | Profile photo privacy: visible to all contacts, or hidden |

### 5.8 Notifications

| ID | Requirement |
|---|---|
| NOTIF-01 | Push notification on new one-to-one message |
| NOTIF-02 | Push notification on new group message |
| NOTIF-03 | Push notification on @mention in a group |
| NOTIF-04 | Push notification on story reply |
| NOTIF-05 | Optional push notification on story view |
| NOTIF-06 | Badge count on app icon (Android) showing unread message count |
| NOTIF-07 | Background notifications arrive when the app is closed or backgrounded |
| NOTIF-08 | Notification sound (system default or custom) |
| NOTIF-09 | Per-chat mute suppresses notifications for that chat |
| NOTIF-10 | Notification tap opens the relevant chat |

### 5.9 Privacy

| ID | Requirement |
|---|---|
| PRIV-01 | Block a user: they cannot send messages; they see a single grey tick |
| PRIV-02 | Unblock a user |
| PRIV-03 | View block list in settings |
| PRIV-04 | Toggle: hide "Last Seen" from all contacts |
| PRIV-05 | Toggle: hide "Online" status from all contacts |
| PRIV-06 | Toggle: disable Read Receipts (blue ticks not sent or received) |
| PRIV-07 | Story privacy: choose who can see stories |
| PRIV-08 | Profile photo privacy: visible to all contacts or nobody |

### 5.10 Search

| ID | Requirement |
|---|---|
| SRCH-01 | Search across all chats by contact name or last message preview |
| SRCH-02 | Search messages within a specific chat by keyword |
| SRCH-03 | Search media (images, videos, documents) shared in a chat |
| SRCH-04 | Global search across all messages from the main search bar |

### 5.11 Settings

| ID | Requirement |
|---|---|
| SET-01 | Toggle between Light and Dark theme |
| SET-02 | View storage usage per chat |
| SET-03 | Clear app cache |
| SET-04 | View and manage active device sessions |
| SET-05 | Access privacy settings (all PRIV-* items) |
| SET-06 | Configure notification preferences (sounds, per-chat overrides) |

---

## 6. Non-Functional Requirements

### 6.1 Performance

| Metric | Target |
|---|---|
| App cold start time (Flutter, mid-range Android) | < 2 seconds |
| Time to render chat list after login | < 1.5 seconds |
| Message send-to-receive latency (same WiFi) | < 300 ms |
| Media thumbnail render time | < 1 second |
| Image upload time (5 MB image, 4G network) | < 5 seconds |
| QR login end-to-end | < 5 seconds |
| Firestore listener update propagation | < 500 ms |
| Story expiry enforcement | Within 60 seconds of 24-hour mark |

### 6.2 Offline Support

- Flutter app must cache the last 50 messages per chat in local SQLite (using `drift` or `hive`)
- Unsent messages are queued and automatically sent on reconnection
- Media downloaded previously is available offline
- Chat list renders from cache while Firestore syncs in background
- Offline state is shown in the UI (banner or status indicator)

### 6.3 Reliability

- Firebase Firestore and RTDB provide 99.95% uptime SLA
- Backend on Vercel Serverless provides auto-scaling and high availability
- Failed media uploads retry up to 3 times with exponential backoff
- FCM delivery is best-effort; missed notifications are reconciled on app foreground

### 6.4 Scalability

- Firestore scales horizontally; no sharding required for personal use
- Cloudflare R2 scales storage automatically
- Backend is stateless (JWT-based); horizontal scaling is inherent on Vercel
- Realtime Database is limited to presence data; load is minimal

### 6.5 Maintainability

- All code follows defined folder structure conventions (see sections 17 and 18)
- Environment variables used for all secrets
- API versioned at `/v1/`
- Firestore indexes defined in `firestore.indexes.json`
- No hard-coded user IDs or secrets in client code

### 6.6 Accessibility

- All interactive elements have semantic labels (Flutter: `Semantics` widget; React: `aria-*` attributes)
- Minimum touch target size: 44×44 dp (Flutter), 44×44 px (Web)
- Color contrast meets WCAG AA standard (4.5:1 for text)
- Screen reader compatibility for both mobile and web

---

## 7. User Stories

### 7.1 Authentication

| ID | Story |
|---|---|
| US-A01 | As a user, I want to enter my Access Key and get logged in immediately so that I don't have to go through phone verification |
| US-A02 | As a user, I want the app to remember my login so that I don't have to re-enter my key every time |
| US-A03 | As a user, I want to see all my active sessions so that I know which devices have access |
| US-A04 | As a user, I want to log out of all devices at once in case I lose a device |
| US-A05 | As a web user, I want to scan a QR code from my phone to log in without typing the key on the web |

### 7.2 Messaging

| ID | Story |
|---|---|
| US-M01 | As a user, I want to send a text message and see it delivered in real-time |
| US-M02 | As a user, I want to send an image and see a thumbnail before it fully uploads |
| US-M03 | As a user, I want to record and send a voice note with a progress bar |
| US-M04 | As a user, I want to reply to a specific message so the context is clear |
| US-M05 | As a user, I want to react to a message with a thumbs up or heart emoji |
| US-M06 | As a user, I want to edit a message I just sent if I made a typo |
| US-M07 | As a user, I want to delete a message for everyone before others read it |
| US-M08 | As a user, I want to star important messages so I can find them later |
| US-M09 | As a user, I want to pin a critical message at the top of a chat |
| US-M10 | As a user, I want to see blue ticks when someone has read my message |
| US-M11 | As a user, I want to see a typing indicator when someone is composing a reply |
| US-M12 | As a user, I want to forward a message to another contact or group |

### 7.3 Groups

| ID | Story |
|---|---|
| US-G01 | As a user, I want to create a group and add my contacts to it |
| US-G02 | As a group admin, I want to remove a member who is causing issues |
| US-G03 | As a user, I want to leave a group I no longer want to be in |
| US-G04 | As a group admin, I want to share an invite link so new members can join easily |
| US-G05 | As a user, I want to be notified specifically when someone @mentions me in a group |

### 7.4 Stories

| ID | Story |
|---|---|
| US-S01 | As a user, I want to post a text or image story visible to my contacts for 24 hours |
| US-S02 | As a user, I want to see who has viewed my story |
| US-S03 | As a user, I want to reply to a contact's story privately |
| US-S04 | As a user, I want my story to automatically disappear after 24 hours |

### 7.5 Privacy & Presence

| ID | Story |
|---|---|
| US-P01 | As a user, I want to hide my "last seen" so others don't know when I was last active |
| US-P02 | As a user, I want to block a contact so they can no longer message me |
| US-P03 | As a user, I want to turn off read receipts so others don't know I've read their messages |
| US-P04 | As a user, I want to see when my contacts are online in real-time |

### 7.6 Search

| ID | Story |
|---|---|
| US-SR01 | As a user, I want to search for a specific word across all my messages |
| US-SR02 | As a user, I want to find all photos shared in a conversation |

### 7.7 Settings

| ID | Story |
|---|---|
| US-ST01 | As a user, I want to switch to dark mode for night-time use |
| US-ST02 | As a user, I want to clear the app cache to free up storage |

---

## 8. User Flows

### 8.1 First-Time Login Flow

```
App Launch
  └─> Check Refresh Token in Secure Storage
        ├─> Token exists & valid → Call /auth/refresh → Update JWT → Go to Home
        └─> No token / expired → Show Login Screen
              └─> User enters Access Key
                    └─> POST /auth/login
                          ├─> 200 OK → Store JWT + Refresh Token → Go to Home
                          └─> 401 → Show "Invalid Key" error
```

### 8.2 QR Login Flow (Web)

```
Web App Opens
  └─> No auth token found
        └─> Show QR Login Screen
              └─> POST /auth/qr/session → Get qrSessionId + QR code URL
                    └─> Render QR code image
                          └─> Subscribe to Firestore /qrSessions/{qrSessionId}
                                ├─> Status: "pending" → Keep showing QR
                                ├─> Status: "scanned" → Show "Confirm on phone..." message
                                ├─> Status: "confirmed" → Store JWT + token → Go to Home
                                ├─> Status: "expired" → Show "QR Expired, tap to refresh"
                                └─> Status: "error" → Show error message

Flutter App (Running)
  └─> User taps "Scan QR for Web Login"
        └─> Open Camera / QR Scanner
              └─> QR code scanned → Extract qrSessionId
                    └─> POST /auth/qr/scan with qrSessionId
                          └─> Backend updates RTDB + Firestore status to "scanned"
                                └─> User sees "Log in to Web?" confirmation
                                      ├─> Confirm → POST /auth/qr/confirm
                                      │     └─> Backend issues JWT, updates status to "confirmed"
                                      └─> Deny → POST /auth/qr/deny → Status "denied"
```

### 8.3 Send Message Flow

```
User types in Chat Input
  └─> Tap Send
        └─> Create local message object with:
              - messageId (UUID client-generated)
              - status: "sending"
              - timestamp: client time
        └─> Optimistic UI: show message immediately in chat
        └─> If media: upload to R2 first (see Media Upload Flow)
        └─> POST /messages/send
              ├─> 200 OK → Update message status to "sent" (✓)
              │     └─> Other user's Firestore listener fires → they see the message
              │           └─> Other user's app: update status to "delivered" (✓✓)
              │                 └─> Other user opens chat: update status to "read" (✓✓ blue)
              └─> Network error → Keep in queue, retry on reconnect
```

### 8.4 Media Upload Flow

```
User selects/captures media
  └─> Client shows upload progress UI (spinner or progress bar)
        └─> POST /storage/upload-url with { fileType, fileName, chatId }
              └─> Backend generates Cloudflare R2 signed upload URL
                    └─> Client PUTs file directly to R2 signed URL
                          ├─> Upload progress events update the progress bar
                          ├─> Success → Client has the R2 public/CDN URL
                          │     └─> Include R2 URL in message payload → Send message
                          └─> Failure → Show retry button; retry up to 3 times
```

### 8.5 Presence Flow

```
App Foreground
  └─> Write to RTDB: /presence/{userId}/state = "online"
        └─> RTDB onDisconnect handler set to write "offline" + timestamp

App Background / Closed
  └─> RTDB onDisconnect fires automatically
        └─> Write: /presence/{userId}/state = "offline"
              └─> Write: /presence/{userId}/lastSeen = serverTimestamp

Other Users
  └─> Subscribe to RTDB /presence/{userId}
        └─> Render "Online" or "Last seen [time]"
```

### 8.6 Typing Indicator Flow

```
User starts typing in chat input
  └─> Debounce 300ms
        └─> Write to RTDB: /typing/{chatId}/{userId} = { isTyping: true, ts: serverTimestamp }

User stops typing (2 second inactivity or sends message)
  └─> Delete RTDB node: /typing/{chatId}/{userId}

Other user in same chat
  └─> Subscribe to RTDB /typing/{chatId}
        └─> If {userId} node exists → show "Typing..."
        └─> If node removed → hide indicator
```

### 8.7 Story Expiry Flow

```
User posts a story
  └─> Backend saves story to Firestore with expiresAt = now + 24h

Every minute (or on view):
  └─> Firestore query: stories where expiresAt < now
        └─> Move to "expired" state or delete
        └─> Update UI: expired stories hidden from story ring
```

### 8.8 Notification Flow

```
New message created in Firestore
  └─> Cloud Function (or backend) triggered
        └─> Look up recipient's FCM token from Firestore /users/{userId}/fcmToken
              └─> Check if chat is muted
                    ├─> Muted → Skip notification
                    └─> Not muted → POST to FCM API with message payload
                          └─> FCM delivers to device
                                └─> Device shows notification
                                      └─> Tap → Open app at relevant chat
```

---
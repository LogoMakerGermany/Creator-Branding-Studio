# Firestore Datenbankschema

## Collections

### `users/{userId}`

```typescript
{
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  authProviders: string[];
  agencyId?: string;
  teamId?: string;
  coinBalance: number;
  subscriptionTier: string;
  stripeCustomerId?: string;
  locale: string;
  onboardingCompleted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Subcollections:**
- `users/{userId}/settings` – Benutzereinstellungen
- `users/{userId}/notifications` – Benachrichtigungen

---

### `creator_dna/{dnaId}`

```typescript
{
  userId: string;
  name: string;
  type: 'creator' | 'team' | 'agency' | 'client';
  primaryColors: string[];
  secondaryColors: string[];
  accentColors: string[];
  styleDirection: string;
  fonts: FontConfig[];
  brandingRules: BrandingRule[];
  platformOptimization: PlatformConfig[];
  targetAudience: TargetAudience;
  designLanguage: DesignLanguage;
  sourceAssets: SourceAsset[];
  aiAnalysis?: DNAAnalysis;
  version: number;
  isActive: boolean;
  teamId?: string;
  agencyId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Subcollections:**
- `creator_dna/{dnaId}/versions` – DNA-Versionshistorie

---

### `projects/{projectId}`

```typescript
{
  name: string;
  description?: string;
  status: ProjectStatus;
  type: ProjectType;
  ownerId: string;
  agencyId?: string;
  clientId?: string;
  teamId?: string;
  dnaId?: string;
  assignedTo: string[];
  deadline?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Subcollections:**
- `projects/{projectId}/assets` – Projekt-Assets
- `projects/{projectId}/feedback` – Kundenfeedback
- `projects/{projectId}/versions` – Design-Versionen
- `projects/{projectId}/change_requests` – Änderungswünsche

---

### `agencies/{agencyId}`

```typescript
{
  name: string;
  slug: string;
  logoUrl?: string;
  bannerUrl?: string;
  description?: string;
  ownerId: string;
  dnaId?: string;
  whiteLabel?: WhiteLabelConfig;
  settings: AgencySettings;
  memberCount: number;
  clientCount: number;
  projectCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Subcollections:**
- `agencies/{agencyId}/members` – Mitarbeiter
- `agencies/{agencyId}/clients` – Kunden
- `agencies/{agencyId}/projects` – Projekte (Referenz)

---

### `teams/{teamId}`

```typescript
{
  name: string;
  slug: string;
  type: string;
  logoUrl?: string;
  bannerUrl?: string;
  description?: string;
  leaderId: string;
  dnaId?: string;
  memberCount: number;
  maxMembers: number;
  isPublic: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Subcollections:**
- `teams/{teamId}/members` – Teammitglieder

---

### `coin_transactions/{transactionId}`

```typescript
{
  userId: string;
  type: 'purchase' | 'spend' | 'refund' | 'bonus' | 'subscription';
  amount: number;
  balanceAfter: number;
  category?: string;
  description: string;
  metadata?: object;
  stripePaymentIntentId?: string;
  createdAt: Timestamp;
}
```

---

### `files/{fileId}`

```typescript
{
  userId: string;
  projectId?: string;
  name: string;
  type: string;
  mimeType: string;
  size: number;
  storagePath: string;
  downloadUrl: string;
  tags: string[];
  createdAt: Timestamp;
}
```

---

### `marketplace_items/{itemId}`

```typescript
{
  sellerId: string;
  title: string;
  description: string;
  category: string;
  priceCoins: number;
  previewUrl: string;
  downloadUrl: string;
  tags: string[];
  rating: number;
  reviewCount: number;
  downloadCount: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### `layouts/{layoutId}`

```typescript
{
  userId: string;
  name: string;
  platform: 'obs' | 'streamlabs' | 'tiktok' | 'twitch';
  canvas: { width: number; height: number };
  elements: LayoutElement[];
  dnaId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### `chat_channels/{channelId}`

```typescript
{
  name: string;
  type: 'team' | 'agency' | 'project';
  teamId?: string;
  agencyId?: string;
  projectId?: string;
  memberIds: string[];
  createdAt: Timestamp;
}
```

**Subcollections:**
- `chat_channels/{channelId}/messages` – Chat-Nachrichten

---

### `content_calendar/{entryId}`

```typescript
{
  userId: string;
  title: string;
  type: 'post' | 'video' | 'livestream' | 'campaign';
  platform: string;
  scheduledAt: Timestamp;
  status: 'draft' | 'scheduled' | 'published';
  content?: string;
  assetIds: string[];
  createdAt: Timestamp;
}
```

---

## Indizes (Firestore)

| Collection | Felder | Query |
|------------|--------|-------|
| `creator_dna` | `userId`, `isActive` | Aktive DNA pro User |
| `projects` | `ownerId`, `status` | Projekte nach Status |
| `projects` | `agencyId`, `status` | Agentur-Projekte |
| `coin_transactions` | `userId`, `createdAt` | Transaktionshistorie |
| `marketplace_items` | `category`, `rating` | Marketplace-Suche |
| `files` | `userId`, `createdAt` | User-Dateien |

## Security Rules (Übersicht)

- Users können nur eigene Daten lesen/schreiben
- Team/Agency-Mitglieder: Zugriff basierend auf Rolle
- Admin-Routen: Nur über Backend (Admin SDK)
- Client Portal: Nur zugewiesene Projekte

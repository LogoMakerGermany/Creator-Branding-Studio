# Benutzerrollen & Berechtigungen

## Rollenhierarchie

```
SUPER_ADMIN
    └── ADMIN
            └── AGENCY_OWNER
                    ├── AGENCY_MANAGER
                    └── AGENCY_EMPLOYEE
            └── TEAM_LEADER
                    └── TEAM_MEMBER
            └── CREATOR
            └── CLIENT
            └── GUEST
```

## Rollen im Detail

### SUPER_ADMIN
Vollzugriff auf die gesamte Plattform. Systemkonfiguration, alle Agenturen, Billing.

### ADMIN
Plattform-Administration ohne White-Label-Konfiguration anderer Agenturen.

### AGENCY_OWNER
Eigentümer einer Agentur. Vollzugriff auf Agentur-Ressourcen, White Label, Mitarbeiter, Kunden.

### AGENCY_MANAGER
Projekt- und Kundenverwaltung, kein White Label, eingeschränkte Mitarbeiterverwaltung.

### AGENCY_EMPLOYEE
Arbeitet an zugewiesenen Projekten, nutzt Studios und KI-Tools.

### TEAM_LEADER
Leitet ein Team/Clan. Team DNA, Mitglieder, Branding für das Team.

### TEAM_MEMBER
Nutzt Team-Ressourcen, Studios und KI-Tools im Team-Kontext.

### CREATOR
Einzelner Creator. Eigene DNA, alle Creator-Module, Marketplace-Verkauf.

### CLIENT
Zugriff auf Kundenportal: Projekte einsehen, Feedback, Downloads.

### GUEST
Nicht eingeloggt. Landing Page, Registrierung.

## Standard-Rolle bei Registrierung

Neue User erhalten automatisch die Rolle **CREATOR**.

## Rollen-Zuweisung

- **Agency Owner:** Bei Agentur-Erstellung
- **Team Leader:** Bei Team-Erstellung
- **Client:** Einladung durch Agentur
- **Admin:** Manuell durch Super Admin

## Permission-Check (Backend)

```typescript
// middleware/requirePermission.ts
requirePermission(Permission.USE_LOGO_STUDIO)
```

## Permission-Check (Frontend)

```typescript
// hooks/usePermission.ts
const canUseLogoStudio = usePermission(Permission.USE_LOGO_STUDIO);
```

Siehe `shared/src/roles.ts` für die vollständige Permission-Matrix.

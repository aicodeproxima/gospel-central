'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/lib/stores/auth-store';
import { usersApi } from '@/lib/api/users';
import {
  usePreferencesStore,
  type ColorTheme,
} from '@/lib/stores/preferences-store';
import { useTranslation } from '@/lib/i18n';
import { ROLE_LABELS } from '@/lib/types';
import {
  Save,
  User,
  Check,
  Palette,
  Globe,
  Calendar,
  Bell,
  Lock,
  BarChart3,
  Keyboard,
  Link2,
  AlertTriangle,
  Camera,
  ChevronDown,
  ChevronRight,
  Download,
  Trash2,
  LogOut,
  Monitor,
  Video,
  Sparkles,
  Settings2,
  Info,
} from 'lucide-react';
import { InfoButton } from '@/components/shared/InfoButton';
import { settingsHelp } from '@/components/shared/pageHelp';
import { avatarsForRole, canPickGospelWorker } from '@/lib/avatars';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import {
  ANIMATED_DARK_THEMES,
  ANIMATED_LIGHT_THEMES,
} from '@/components/shared/ThemedBackground';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  BACKGROUNDS,
  BACKGROUND_ORDER,
  type BackgroundId,
} from '@/lib/background/schemas';
import { BackgroundCustomizerDialog } from '@/components/shared/BackgroundCustomizerDialog';
import { APP_VERSION } from '@/lib/version';

interface ThemeOption {
  id: ColorTheme;
  label: string;
  color: string;
}

// All themes are available to every authenticated user. The 9 decorative
// / animated themes (starfield → deepspace) used to be gated behind the
// literal username='admin' check in the picker; that gate was lifted so
// Stephen, Branch Leaders, Members, etc. can pick any theme too.
const THEME_OPTIONS: ThemeOption[] = [
  { id: 'default', label: 'Default', color: 'bg-gray-500' },
  { id: 'ocean', label: 'Ocean', color: 'bg-blue-500' },
  { id: 'purple', label: 'Purple', color: 'bg-violet-500' },
  { id: 'forest', label: 'Forest', color: 'bg-green-500' },
  { id: 'sunset', label: 'Sunset', color: 'bg-orange-500' },
  { id: 'rose', label: 'Rose', color: 'bg-rose-500' },
  { id: 'marble', label: 'Marble', color: 'bg-gradient-to-br from-[#fdfaf2] via-[#e6c458] to-[#b8941f]' },
  { id: 'starfield', label: 'Starfield', color: 'bg-gradient-to-br from-[#1a0b3d] via-[#6d28d9] to-[#a855f7]' },
  { id: 'aurora', label: 'Aurora', color: 'bg-gradient-to-br from-[#0a2e1a] via-[#2dbd6e] to-[#8b5cf6]' },
  { id: 'galaxy', label: 'Galaxy', color: 'bg-gradient-to-br from-[#04021a] via-[#a855f7] to-[#fce7f3]' },
  { id: 'jellyfish', label: 'Jellyfish', color: 'bg-gradient-to-br from-[#04101e] via-[#0891b2] to-[#a855f7]' },
  { id: 'rain', label: 'Rain', color: 'bg-gradient-to-br from-[#0a0f1a] via-[#64748b] to-[#a8c5ff]' },
  { id: 'matrix', label: 'Matrix', color: 'bg-gradient-to-br from-[#000a08] via-[#065f46] to-[#10b981]' },
  { id: 'constellation', label: 'Constellation', color: 'bg-gradient-to-br from-[#040811] via-[#1e40af] to-[#60a5fa]' },
  { id: 'synapse', label: 'Synapse', color: 'bg-gradient-to-br from-[#040814] via-[#0891b2] to-[#38bdf8]' },
  { id: 'deepspace', label: 'Deep Space', color: 'bg-gradient-to-br from-[#02010a] via-[#1e1b4b] to-[#f59e0b]' },
];

const SHORTCUTS = [
  { keys: 'Esc', action: 'Close any open dialog' },
  { keys: '↑ ↓', action: 'Navigate search results' },
  { keys: 'Enter', action: 'Select search result' },
  { keys: 'Swipe ← →', action: 'Navigate calendar periods' },
  { keys: 'Click row', action: 'Open audit log detail' },
  { keys: 'Drag card', action: 'Move contact between stages (Kanban)' },
];

export default function SettingsPage() {
  const { user, setUser, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const prefs = usePreferencesStore();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // Collapsible
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Animated-background customizer popup
  const [bgCustomizerOpen, setBgCustomizerOpen] = useState(false);

  // Photo upload
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setEmail(user.email);
      setPhone(user.phone || '');
      setAvatarUrl(user.avatarUrl);
    }
  }, [user]);

  const isDirty =
    user &&
    (firstName !== user.firstName ||
      lastName !== user.lastName ||
      email !== user.email ||
      phone !== (user.phone || '') ||
      avatarUrl !== user.avatarUrl);

  const handleSave = async () => {
    if (!user) return;
    const prev = user;
    // Optimistic local update, then persist the editable profile fields to the
    // backend so they survive a reload once a real backend is wired (the mock
    // stores them in-memory). avatarUrl is a frontend-only 3D-avatar choice and
    // stays local. Revert the optimistic update if the save fails.
    setUser({ ...user, firstName, lastName, email, phone, avatarUrl });
    try {
      await usersApi.update(user.id, { firstName, lastName, email, phone, actorId: user.id });
      toast.success(t('btn.save'));
    } catch (e) {
      console.error('Failed to save profile', e);
      setUser(prev);
      toast.error('Could not save your profile — please try again');
    }
  };

  const handlePasswordChange = () => {
    if (!currentPw || !newPw || !confirmPw) {
      toast.error('Please fill all password fields');
      return;
    }
    if (newPw.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPw !== confirmPw) {
      toast.error('Passwords do not match');
      return;
    }
    toast.success('Password updated (mock)');
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500000) {
      toast.error('Image must be under 500KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Downscale to a small thumbnail before persisting: the photo is only ever
      // rendered at ~16–64px (sidebar + settings avatar), and it lives in the
      // shared `diamond-preferences` localStorage blob — storing a full-res
      // data-URL there risks the ~5MB quota and would silently fail the persist
      // of ALL prefs. Falls back to the raw data-URL if canvas isn't available.
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 128;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no 2d context');
          ctx.drawImage(img, 0, 0, w, h);
          prefs.setProfilePhoto(canvas.toDataURL('image/jpeg', 0.85));
        } catch {
          prefs.setProfilePhoto(dataUrl);
        }
        toast.success('Profile photo updated');
      };
      img.onerror = () => {
        prefs.setProfilePhoto(dataUrl);
        toast.success('Profile photo updated');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleExportData = () => {
    const data = {
      user: {
        firstName: user?.firstName,
        lastName: user?.lastName,
        email: user?.email,
        phone: user?.phone,
        username: user?.username,
        role: user?.role,
      },
      preferences: {
        colorTheme: prefs.colorTheme,
        language: prefs.language,
        calendarDefaultView: prefs.calendarDefaultView,
        timeFormat: prefs.timeFormat,
        notifications: prefs.notifications,
      },
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gospel-central-my-data.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Data exported');
  };

  const handleDeleteAccount = () => {
    if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
    toast.success('Account deleted (mock)');
    logout();
  };

  const availableAvatars = user ? avatarsForRole(user.role) : [];
  const showGospelLabel = user ? canPickGospelWorker(user.role) : false;

  if (!user) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-3xl space-y-6 pb-12 xl:mx-auto xl:max-w-[1500px]"
    >
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{t('page.settings.title')}</h1>
          <InfoButton {...settingsHelp} />
        </div>
        <p className="text-sm text-muted-foreground">{t('page.settings.subtitle')}</p>
      </div>

      {/* Cards: single column on phone/tablet (unchanged); 2-up masonry on
          desktop (≥xl — where the full sidebar shows and the page used to
          strand ~40% empty on the right). break-inside-avoid keeps each card
          whole across the column gap; the per-item mb replaces space-y, which
          can't bridge the column break. */}
      <div className="space-y-6 xl:columns-2 xl:gap-6 xl:space-y-0 xl:[&>*]:mb-6 [&>*]:break-inside-avoid">
      {/* 1. Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t('settings.profile')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              {prefs.profilePhotoBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={prefs.profilePhotoBase64}
                  alt="Profile"
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold">
                  {user.firstName[0]}{(user.lastName || '')[0] || ''}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 rounded-full bg-card border border-border p-1 hover:bg-accent transition-colors max-md:h-11 max-md:w-11 max-md:flex max-md:items-center max-md:justify-center"
                aria-label="Upload photo"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>
            <div>
              <p className="text-lg font-semibold">{user.firstName} {user.lastName}</p>
              <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('settings.firstName')}</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.lastName')}</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.email')}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.phone')}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" />
            {t('btn.save')}
            {isDirty && (
              <Badge variant="destructive" className="ml-1 text-[9px] px-1.5 py-0">
                {t('settings.unsaved')}
              </Badge>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* About — app version / build identity. Values come from
          src/lib/version.ts (generated at build time); the same data is served
          at /version.json and drives the update-available banner. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            {t('settings.about')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">{t('settings.version')}</span>
              <p className="font-medium font-mono">v{APP_VERSION.version}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t('settings.build')}</span>
              <p className="font-medium font-mono">{APP_VERSION.shortCommit}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t('settings.built')}</span>
              <p className="font-medium">
                {format(new Date(APP_VERSION.buildTime), 'MMM d, yyyy')}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">{t('settings.branch')}</span>
              <p className="font-medium font-mono">{APP_VERSION.branch}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Account Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t('settings.account')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">{t('settings.username')}</span>
              <p className="font-medium font-mono">{user.username}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t('settings.role')}</span>
              <p className="font-medium">{ROLE_LABELS[user.role]}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t('settings.memberSince')}</span>
              <p className="font-medium">{format(new Date(user.createdAt), 'MMMM d, yyyy')}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t('settings.status')}</span>
              <p className="font-medium text-green-500">{t('settings.active')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Theme Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            {t('settings.theme')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dark/Light toggle — disabled on themes that override the
              foundational CSS variables for both :root and .dark
              selectors and therefore ignore next-themes' light/dark
              class entirely (theme audit L-1 + STATIC-1). Toggling
              mode would otherwise produce no visible change.
              Mode-fixed themes today: the 9 animated themes
              (canvas-dark) + marble (gold-on-cream texture). */}
          {(() => {
            const themeIsModeFixed =
              ANIMATED_DARK_THEMES.has(prefs.colorTheme) ||
              ANIMATED_LIGHT_THEMES.has(prefs.colorTheme) ||
              prefs.colorTheme === 'marble' ||
              prefs.backgroundStyle !== 'none';
            return (
              <div className="space-y-1.5">
                {/* mobile: allow the three mode buttons to wrap on narrow
                    phones; ≥xl unchanged (they fit on one row there) */}
                <div className="flex items-center gap-3 max-xl:flex-wrap">
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('dark')}
                    disabled={themeIsModeFixed}
                    className="touch-manipulation max-xl:h-11"
                  >
                    {t('settings.theme.dark')}
                  </Button>
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('light')}
                    disabled={themeIsModeFixed}
                    className="touch-manipulation max-xl:h-11"
                  >
                    {t('settings.theme.light')}
                  </Button>
                  <Button
                    variant={theme === 'system' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('system')}
                    disabled={themeIsModeFixed}
                    className="touch-manipulation max-xl:h-11"
                  >
                    {t('settings.theme.system')}
                  </Button>
                </div>
                {themeIsModeFixed && (
                  <p className="text-xs text-muted-foreground">
                    This color theme or animated background manages its own surfaces and ignores
                    Dark / Light / System. Pick the default palette (and no background) to re-enable
                    mode switching.
                  </p>
                )}
              </div>
            );
          })()}

          <Separator />

          {/* Color themes — all 16 available to every authenticated user. */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">{t('settings.colorAccent')}</p>
            <div className="flex flex-wrap gap-3">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => prefs.setColorTheme(opt.id)}
                  aria-label={`${opt.label} theme`}
                  aria-pressed={prefs.colorTheme === opt.id}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border-2 p-2.5 transition-all touch-manipulation',
                    prefs.colorTheme === opt.id
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-border hover:border-primary/40',
                  )}
                >
                  <div className={cn('h-8 w-8 rounded-full shadow-inner', opt.color)} />
                  <span className="text-[10px] text-muted-foreground">{opt.label}</span>
                  {prefs.colorTheme === opt.id && (
                    <Check className="h-3 w-3 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Animated background — a SEPARATE axis from the palette. The chosen
              animation reads the active theme's colors at runtime (so it stays
              theme-tinted); "Customize…" lets the user override any value. */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Animated background — colors follow your theme
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => prefs.setBackgroundStyle('none')}
                aria-label="No animated background"
                aria-pressed={prefs.backgroundStyle === 'none'}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border-2 p-2.5 transition-all touch-manipulation',
                  prefs.backgroundStyle === 'none'
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border hover:border-primary/40',
                )}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-[8px] uppercase text-muted-foreground">
                  Off
                </div>
                <span className="text-[10px] text-muted-foreground">None</span>
                {prefs.backgroundStyle === 'none' && <Check className="h-3 w-3 text-primary" />}
              </button>

              {BACKGROUND_ORDER.map((id) => {
                const bg = BACKGROUNDS[id];
                const selected = prefs.backgroundStyle === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => prefs.setBackgroundStyle(id)}
                    aria-label={`${bg.title} background`}
                    aria-pressed={selected}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border-2 p-2.5 transition-all touch-manipulation',
                      selected
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-border hover:border-primary/40',
                    )}
                  >
                    <div
                      className="h-8 w-8 rounded-full shadow-inner"
                      style={{ background: bg.swatch }}
                    />
                    <span className="text-[10px] text-muted-foreground">{bg.title}</span>
                    {selected && <Check className="h-3 w-3 text-primary" />}
                  </button>
                );
              })}
            </div>

            {prefs.backgroundStyle !== 'none' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBgCustomizerOpen(true)}
                className="mt-3 gap-2 touch-manipulation"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Customize background…
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 4. Language */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t('settings.language')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 max-sm:flex-wrap">
            <Button
              variant={prefs.language === 'en' ? 'default' : 'outline'}
              onClick={() => prefs.setLanguage('en')}
              className="gap-2 touch-manipulation max-sm:flex-1"
            >
              🇺🇸 English
            </Button>
            <Button
              variant={prefs.language === 'es' ? 'default' : 'outline'}
              onClick={() => prefs.setLanguage('es')}
              className="gap-2 touch-manipulation max-sm:flex-1"
            >
              🇪🇸 Español
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 5. Calendar Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('settings.calendarPrefs')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('settings.defaultView')}</Label>
              <Select
                value={prefs.calendarDefaultView}
                onValueChange={(v) => v && prefs.setCalendarDefaultView(v as 'day' | 'week' | 'month')}
              >
                <SelectTrigger>
                  <SelectValue>
                    {prefs.calendarDefaultView === 'day'
                      ? t('cal.day')
                      : prefs.calendarDefaultView === 'week'
                        ? t('cal.week')
                        : t('cal.month')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">{t('cal.day')}</SelectItem>
                  <SelectItem value="week">{t('cal.week')}</SelectItem>
                  <SelectItem value="month">{t('cal.month')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('settings.timeFormat')}</Label>
              <Select
                value={prefs.timeFormat}
                onValueChange={(v) => v && prefs.setTimeFormat(v as '12h' | '24h')}
              >
                <SelectTrigger>
                  <SelectValue>
                    {prefs.timeFormat === '12h' ? '12-hour (9:00 am)' : '24-hour (09:00)'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12h">12-hour (9:00 am)</SelectItem>
                  <SelectItem value="24h">24-hour (09:00)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 6. Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t('settings.notifications')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t('settings.notifications.deviceNote')}
          </p>
          {([
            ['bookingConfirmations', t('settings.notifications.bookingConfirm'), t('settings.notifications.bookingConfirmDesc')],
            ['bookingCancellations', t('settings.notifications.bookingCancel'), t('settings.notifications.bookingCancelDesc')],
            ['contactStageChanges', t('settings.notifications.stageChanges'), t('settings.notifications.stageChangesDesc')],
            ['weeklySummary', t('settings.notifications.weeklySummary'), t('settings.notifications.weeklySummaryDesc')],
          ] as const).map(([key, label, desc]) => (
            // mobile: stack label above the switch on very narrow phones;
            // ≥sm (incl. desktop) keeps the inline justify-between row.
            <div key={key} className="flex items-center justify-between gap-3 max-[400px]:flex-col max-[400px]:items-start">
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch
                checked={prefs.notifications[key]}
                onCheckedChange={(v) => prefs.setNotification(key, !!v)}
                className="touch-manipulation shrink-0"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 7. 3D Avatar */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.avatar')}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {showGospelLabel
              ? t('settings.avatarGospel')
              : t('settings.avatarDefault')}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {availableAvatars.map((a) => {
              const selected = avatarUrl === a.url;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAvatarUrl(a.url)}
                  className={cn(
                    'group relative flex flex-col items-center rounded-lg border-2 bg-black/40 p-2 transition',
                    selected ? 'border-primary ring-2 ring-primary/40' : 'border-white/10 hover:border-white/30',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.label} className="h-28 w-full object-contain" />
                  <span className="mt-2 text-[10px] text-center text-muted-foreground line-clamp-2">
                    {a.label.replace('Gospel Worker — ', '').replace('Default — ', '')}
                  </span>
                  {selected && (
                    <span className="absolute right-1 top-1 rounded-full bg-primary p-1 text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <Button onClick={handleSave} className="mt-4 gap-2" size="sm">
            <Save className="h-4 w-4" />
            {t('btn.saveAvatar')}
          </Button>
        </CardContent>
      </Card>

      {/* 8. Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {t('settings.password')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>{t('settings.currentPassword')}</Label>
              <Input type="password" autoComplete="current-password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.newPassword')}</Label>
              <Input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.confirmPassword')}</Label>
              <Input type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
            </div>
          </div>
          <Button onClick={handlePasswordChange} variant="outline" size="sm" className="gap-2">
            <Lock className="h-3.5 w-3.5" />
            {t('btn.updatePassword')}
          </Button>
        </CardContent>
      </Card>

      {/* 9. Activity Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t('settings.activity')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 text-center">
            {[
              { label: t('settings.bookings'), value: '68' },
              { label: t('settings.contacts'), value: '50' },
              { label: t('settings.sessionsLed'), value: '24' },
              { label: t('settings.memberSince'), value: format(new Date(user.createdAt), 'MMM yyyy') },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border bg-accent/20 p-3">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 10. Keyboard Shortcuts */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => setShortcutsOpen((v) => !v)}
        >
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            {t('settings.shortcuts')}
            {shortcutsOpen ? (
              <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
            )}
          </CardTitle>
        </CardHeader>
        {shortcutsOpen && (
          <CardContent>
            <div className="space-y-2">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{s.action}</span>
                  <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* 11. Connected Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t('settings.integrations')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: 'Zoom', icon: Video, desc: 'Auto-generate Zoom links for bookings' },
            { name: 'Google Calendar', icon: Calendar, desc: 'Sync bookings to Google Calendar' },
            { name: 'Microsoft Teams', icon: Monitor, desc: 'Teams meeting integration' },
          ].map((integration) => (
            <div key={integration.name} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 max-[400px]:flex-col max-[400px]:items-start">
              <div className="flex items-center gap-3 min-w-0">
                <integration.icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{integration.name}</p>
                  <p className="text-xs text-muted-foreground">{integration.desc}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">{t('misc.comingSoon')}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 12. Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {t('settings.danger')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* mobile: each danger row stacks label above its action button on
              narrow phones; ≥sm keeps the inline justify-between row. */}
          <div className="flex items-center justify-between gap-3 max-[400px]:flex-col max-[400px]:items-start">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('settings.danger.signOutAll')}</p>
              <p className="text-xs text-muted-foreground">{t('settings.danger.signOutDesc')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { logout(); toast.success('Signed out'); }} className="gap-1.5 touch-manipulation shrink-0 max-[400px]:w-full">
              <LogOut className="h-3.5 w-3.5" />
              {t('nav.signOut')}
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3 max-[400px]:flex-col max-[400px]:items-start">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('settings.danger.exportData')}</p>
              <p className="text-xs text-muted-foreground">{t('settings.danger.exportDesc')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportData} className="gap-1.5 touch-manipulation shrink-0 max-[400px]:w-full">
              <Download className="h-3.5 w-3.5" />
              {t('btn.export')}
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3 max-[400px]:flex-col max-[400px]:items-start">
            <div className="min-w-0">
              <p className="text-sm font-medium text-destructive">{t('settings.danger.deleteAccount')}</p>
              <p className="text-xs text-muted-foreground">{t('settings.danger.deleteDesc')}</p>
            </div>
            <Button variant="destructive" size="sm" onClick={handleDeleteAccount} className="gap-1.5 touch-manipulation shrink-0 max-[400px]:w-full">
              <Trash2 className="h-3.5 w-3.5" />
              {t('btn.delete')}
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>

      {prefs.backgroundStyle !== 'none' && (
        <BackgroundCustomizerDialog
          style={prefs.backgroundStyle as BackgroundId}
          open={bgCustomizerOpen}
          onClose={() => setBgCustomizerOpen(false)}
        />
      )}
    </motion.div>
  );
}

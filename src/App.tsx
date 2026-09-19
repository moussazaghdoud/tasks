import { useEffect } from 'react';
import { useWorkspace } from '@/store/workspace';
import { useUi } from '@/store/ui';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { MobileApp } from '@/mobile/MobileApp';
import { useNative } from '@/hooks/useNative';
import { useReminders } from '@/hooks/useReminders';
import { AppShell } from '@/components/shell/AppShell';
import { CaptureSheet, MobileDrawer } from '@/components/shell/MobileNavigation';
import { CommandPalette } from '@/components/palette/CommandPalette';
import { GlobalPicker } from '@/components/pickers/PickerContent';
import { FocusMode } from '@/components/focus/FocusMode';
import { TriageMode } from '@/components/triage/TriageMode';
import { ProjectDialog } from '@/components/projects/ProjectDialog';
import { ShortcutGuide } from '@/components/ShortcutGuide';
import { Toaster } from '@/components/ui/Toaster';
import { VoiceCapture } from '@/components/voice/VoiceCapture';

if (import.meta.env.DEV) {
  // Handy in the console while developing: __hence.ui.getState(), __hence.ws.getState()
  void Promise.all([import('@/store/ui'), import('@/store/workspace')]).then(([u, w]) => {
    (window as unknown as Record<string, unknown>).__hence = { ui: u.useUi, ws: w.useWorkspace };
  });
}

export default function App() {
  const ready = useWorkspace((s) => s.ready);
  const init = useWorkspace((s) => s.init);
  const mobile = useIsMobile();

  useEffect(() => {
    void init();
    // Home-screen shortcut: /?capture=voice opens the microphone straight away.
    const params = new URLSearchParams(window.location.search);
    if (params.get('capture') === 'voice') {
      params.delete('capture');
      const rest = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
      requestAnimationFrame(() => useUi.getState().setVoice(true));
    }
  }, [init]);
  useGlobalShortcuts();
  useReminders();
  useNative();

  if (!ready) return <div className="h-dvh bg-desk" aria-busy="true" />;

  // A phone gets its own application rather than the desktop one folded up:
  // different hierarchy, different primary action, different interactions.
  // Only the store, the voice pipeline and the native bridge are shared.
  if (mobile) {
    return (
      <>
        <MobileApp />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <AppShell />
      <GlobalPicker />
      <CommandPalette />
      <FocusMode />
      <TriageMode />
      <ProjectDialog />
      <ShortcutGuide />
      <CaptureSheet />
      <VoiceCapture />
      <MobileDrawer />
      <Toaster />
    </>
  );
}

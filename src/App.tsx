import { useEffect } from 'react';
import { useWorkspace } from '@/store/workspace';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
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

  useEffect(() => {
    void init();
  }, [init]);
  useGlobalShortcuts();
  useReminders();

  if (!ready) return <div className="h-dvh bg-desk" aria-busy="true" />;

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

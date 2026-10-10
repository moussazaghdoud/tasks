import { registerPlugin } from '@capacitor/core';

/**
 * The iPhone side of sharing (ShareBoxPlugin.swift): the iCloud mailbox,
 * the notice of arrival, and the identity kept in the iCloud Keychain.
 * Registered once, here, for every module that needs it.
 */

export interface Envelope {
  id: string;
  kind: string;
  from: string;
  data: string;
  sentAt: string;
}

/** Each link a notice of arrival depends on. */
export interface NoticeStatus {
  permission: string;
  registered: boolean;
  subscribed: boolean;
  error: string;
}

interface ShareBoxPlugin {
  available(): Promise<{ available: boolean }>;
  post(options: { to: string; kind: string; from: string; data: string }): Promise<void>;
  fetch(options: { to: string }): Promise<{ envelopes: Envelope[] }>;
  remove(options: { ids: string[] }): Promise<void>;
  subscribe(options: { to: string; alert: string }): Promise<void>;
  chime(): Promise<void>;
  status(options: { to: string }): Promise<NoticeStatus>;
  keepIdentity(options: { value: string }): Promise<void>;
  readIdentity(): Promise<{ value?: string }>;
}

export const ShareBox = registerPlugin<ShareBoxPlugin>('ShareBox');

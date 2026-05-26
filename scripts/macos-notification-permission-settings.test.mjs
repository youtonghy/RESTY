import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const localeFiles = [
  '../public/locales/en/translation.json',
  '../public/locales/en-US/translation.json',
  '../public/locales/en-GB/translation.json',
  '../public/locales/zh-CN/translation.json',
  '../public/locales/zh-TW/translation.json',
];

const getPath = (source, path) =>
  path.split('.').reduce((value, key) => value?.[key], source);

test('settings exposes notification permission controls only inside the macOS block', async () => {
  const source = await readFile(new URL('../src/pages/Settings.tsx', import.meta.url), 'utf8');

  assert.match(source, /getNotificationPermissionStatus/);
  assert.match(source, /requestNotificationPermissionStatus/);
  assert.match(source, /MACOS_NOTIFICATION_SETTINGS_URL/);
  assert.match(source, /MACOS_NOTIFICATION_SETTINGS_FALLBACK_URL/);
  assert.match(
    source,
    /isMacos && \([\s\S]*settings\.system\.notificationPermission\.title[\s\S]*\)/
  );
});

test('macOS notification sends only use already-granted permission', async () => {
  const source = await readFile(
    new URL('../src/services/notifications.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /const isMacOSPlatform/);
  assert.match(source, /requestNotificationPermissionStatus/);
  assert.match(
    source,
    /if \(isMacOSPlatform\) \{\s*return false;\s*\}\s*const permission = await requestPermission/
  );
});

test('notification permission copy exists in every locale', async () => {
  const requiredKeys = [
    'settings.system.notificationPermission.title',
    'settings.system.notificationPermission.description',
    'settings.system.notificationPermission.check',
    'settings.system.notificationPermission.request',
    'settings.system.notificationPermission.openSettings',
    'settings.system.notificationPermission.notGrantedHint',
    'settings.system.notificationPermission.grantedMessage',
    'settings.system.notificationPermission.notGrantedMessage',
    'settings.system.notificationPermission.openFailed',
    'settings.system.notificationPermission.status.unknown',
    'settings.system.notificationPermission.status.checking',
    'settings.system.notificationPermission.status.granted',
    'settings.system.notificationPermission.status.notGranted',
    'settings.system.notificationPermission.status.unsupported',
    'settings.system.notificationPermission.status.error',
  ];

  for (const file of localeFiles) {
    const locale = JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));
    for (const key of requiredKeys) {
      assert.equal(typeof getPath(locale, key), 'string', `${file} missing ${key}`);
    }
  }
});

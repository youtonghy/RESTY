import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const localeFiles = [
  '../public/locales/en-US/translation.json',
  '../public/locales/en-GB/translation.json',
  '../public/locales/zh-CN/translation.json',
  '../public/locales/zh-TW/translation.json',
];

const getPath = (source, path) =>
  path.split('.').reduce((value, key) => value?.[key], source);

test('settings exposes macOS-only controls in a dedicated macOS section', async () => {
  const source = await readFile(new URL('../src/pages/Settings.tsx', import.meta.url), 'utf8');

  assert.match(source, /getNotificationPermissionStatus/);
  assert.match(source, /requestNotificationPermissionStatus/);
  assert.match(source, /MACOS_NOTIFICATION_SETTINGS_URL/);
  assert.match(source, /MACOS_NOTIFICATION_SETTINGS_FALLBACK_URL/);
  assert.match(
    source,
    /if \(isMacos\) \{\s*sections\.push\(\{\s*id: 'macos',\s*label: t\('settings\.macos\.title'\)\s*\}\);\s*\}/
  );
  assert.match(
    source,
    /isMacos && activeSection === 'macos'[\s\S]*settings\.macos\.menuBarOnly[\s\S]*settings\.macos\.notificationPermission\.title[\s\S]*\)/
  );

  const systemSectionStart = source.indexOf("{activeSection === 'system'");
  const macosSectionStart = source.indexOf('{/* macOS Settings */}');
  assert.notEqual(systemSectionStart, -1, 'system settings section is missing');
  assert.notEqual(macosSectionStart, -1, 'macOS settings section is missing');
  const systemSection = source.slice(systemSectionStart, macosSectionStart);
  assert.doesNotMatch(systemSection, /settings\.macos\./);
  assert.doesNotMatch(systemSection, /macosMenuBarOnly/);
  assert.doesNotMatch(systemSection, /notificationPermission/);
});

test('macOS notification sends only use already-granted permission', async () => {
  const source = await readFile(
    new URL('../src/services/notifications.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /const isMacOSPlatform/);
  assert.match(source, /requestNotificationPermissionStatus/);
  assert.match(source, /type NotificationSendResult/);
  assert.match(source, /export async function notifyRestStartsSoon/);
  assert.match(
    source,
    /if \(isMacOSPlatform\) \{\s*return 'notGranted';\s*\}\s*const permission = await requestPermission/
  );
  assert.match(source, /permissionStatus !== 'granted'[\s\S]*'permissionMissing'/);
});

test('rest-start-soon setting verifies notification permission when enabled', async () => {
  const source = await readFile(new URL('../src/pages/Settings.tsx', import.meta.url), 'utf8');

  assert.match(source, /verifyNotificationPermissionForReminder/);
  assert.match(source, /requestNotificationPermissionStatus\(\)/);
  assert.match(source, /getNotificationPermissionStatus\(\)/);
  assert.match(source, /settings\.reminder\.restStartSoonNotification\.permissionGranted/);
  assert.match(source, /settings\.reminder\.restStartSoonNotification\.permissionRequired/);
  assert.match(
    source,
    /if \(enabled\) \{\s*void verifyNotificationPermissionForReminder\(\);\s*\} else \{\s*setMessage\(''\);\s*\}/
  );
});

test('notification permission copy exists in every locale', async () => {
  const requiredKeys = [
    'settings.reminder.restStartSoonNotification.permissionGranted',
    'settings.reminder.restStartSoonNotification.permissionRequired',
    'settings.macos.title',
    'settings.macos.menuBarOnly',
    'settings.macos.menuBarOnlyHint',
    'settings.macos.notificationPermission.title',
    'settings.macos.notificationPermission.description',
    'settings.macos.notificationPermission.check',
    'settings.macos.notificationPermission.request',
    'settings.macos.notificationPermission.openSettings',
    'settings.macos.notificationPermission.notGrantedHint',
    'settings.macos.notificationPermission.grantedMessage',
    'settings.macos.notificationPermission.notGrantedMessage',
    'settings.macos.notificationPermission.openFailed',
    'settings.macos.notificationPermission.status.unknown',
    'settings.macos.notificationPermission.status.checking',
    'settings.macos.notificationPermission.status.granted',
    'settings.macos.notificationPermission.status.notGranted',
    'settings.macos.notificationPermission.status.unsupported',
    'settings.macos.notificationPermission.status.error',
  ];
  const movedSystemKeys = [
    'settings.system.macosMenuBarOnly',
    'settings.system.macosMenuBarOnlyHint',
    'settings.system.notificationPermission.title',
  ];

  for (const file of localeFiles) {
    const locale = JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));
    for (const key of requiredKeys) {
      assert.equal(typeof getPath(locale, key), 'string', `${file} missing ${key}`);
    }
    for (const key of movedSystemKeys) {
      assert.equal(getPath(locale, key), undefined, `${file} still has ${key}`);
    }
  }
});

/**
 * What an assistant action did, in a few words for the chat ("Flew to Kyiv", "Frontlines on"),
 * so the user sees the assistant operating the app. Names it cannot know offline (an event's
 * title, a country's name) come from the caller's lookups.
 */
import { formatAt, parseIso, type ClientAction, type LayerId } from '@worldlens/shared';
import { resolutionForIso } from './actionExecutor';

const LAYER: Record<LayerId, string> = {
  news: 'Current events',
  history: 'Historical events',
  battles: 'Battles',
  demo: 'Demo scenarios',
  borders: 'Borders',
  frontlines: 'Frontlines',
  labels: 'Event names',
  places: 'Place names',
};

const PANEL: Record<string, string> = {
  account: 'Account settings',
  ai_settings: 'AI settings',
  history: 'History',
  layers: 'Layers and settings',
  help: 'Help',
  events: 'Events',
  search: 'Search',
  sign_in: 'Sign in',
};

const SECTION: Record<string, string> = {
  username: 'Username',
  email: 'Email',
  password: 'Password',
  delete_account: 'Delete account',
};

const onOff = (v: boolean) => (v ? 'on' : 'off');

/** "1941-06-22" → "22 Jun 1941", "1941-06" → "Jun 1941", "1941" → "1941". */
export function dateLabel(iso: string): string {
  const res = resolutionForIso(iso);
  return formatAt(parseIso(iso), res === 'hour' ? 'day' : res, { upper: false });
}

export function actionLabel(
  a: ClientAction,
  lookup: { eventTitle?: string | undefined; countryName?: string | undefined } = {},
): string {
  switch (a.tool) {
    case 'fly_to':
      return a.args.label ? `Flew to ${a.args.label}` : 'Moved the camera';
    case 'zoom':
      return `Zoomed ${a.args.direction}`;
    case 'pan':
      return `Moved ${a.args.direction}`;
    case 'set_time':
      return `Went to ${dateLabel(a.args.date)}`;
    case 'return_to_live':
      return 'Back to LIVE';
    case 'play_timeline':
      return a.args.playing
        ? `Playing the timeline${a.args.from ? ` from ${dateLabel(a.args.from)}` : ''}`
        : 'Paused the timeline';
    case 'highlight_region':
      return a.args.country === 'none'
        ? 'Cleared the highlight'
        : `Highlighted ${lookup.countryName ?? a.args.country}`;
    case 'highlight_place':
      return a.args.name === 'none' ? 'Cleared the mark' : `Marked ${a.args.name}`;
    case 'show_events':
      return a.args.kind === 'news'
        ? 'Showing news'
        : a.args.kind === 'historical'
          ? 'Showing history'
          : 'Showing all events';
    case 'open_event':
      return lookup.eventTitle ? `Opened “${lookup.eventTitle}”` : 'Opened the event';
    case 'open_country':
      return `Opened ${a.args.name}`;
    case 'toggle_layer':
      return `${LAYER[a.args.layer]} ${onOff(a.args.enabled)}`;
    case 'open_take_action':
      return 'Opened Take action';
    case 'set_display': {
      const parts = [
        a.args.quality &&
          `Graphics ${a.args.quality === 'auto' ? 'Auto' : a.args.quality.toUpperCase()}`,
        a.args.night !== undefined && `Night time ${onOff(a.args.night)}`,
        a.args.city_lights !== undefined && `City lights ${onOff(a.args.city_lights)}`,
        a.args.diagnostics !== undefined && `Diagnostics ${onOff(a.args.diagnostics)}`,
      ];
      return parts.filter(Boolean).join(' · ');
    }
    case 'set_ai_settings': {
      const parts = [
        a.args.agent_mode !== undefined && (a.args.agent_mode ? 'Agent mode' : 'Chat mode'),
        a.args.remember_chats !== undefined && `Chat memory ${onOff(a.args.remember_chats)}`,
        a.args.read_history !== undefined && `Reading history ${onOff(a.args.read_history)}`,
      ];
      return parts.filter(Boolean).join(' · ');
    }
    case 'open_panel':
      if (a.args.panel === 'close') return 'Closed the windows';
      return `Opened ${PANEL[a.args.panel] ?? a.args.panel}${
        a.args.section ? ` · ${SECTION[a.args.section]}` : ''
      }`;
  }
}

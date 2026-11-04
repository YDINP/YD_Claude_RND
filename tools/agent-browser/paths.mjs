// Where the shared login lives. Outside the repo: it holds session cookies.
import { join } from 'node:path';

const base = join(process.env.LOCALAPPDATA, 'ms-playwright-mcp');

/** Persistent profile you log into by hand (the old playwright-b profile). */
export const LOGIN_PROFILE = join(base, 'mcp-chrome-real');
/** Cookies + localStorage exported from it, loaded by every isolated session. */
export const STATE_FILE = join(base, 'shared-login.json');

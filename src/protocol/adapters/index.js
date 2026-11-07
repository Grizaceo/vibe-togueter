// Registry of remote-game adapters. The SDK adapter is not remote (it runs
// local games); t99 has its own session machinery and stays outside.
import { TeeAdapter } from "./tee.js";
export const REMOTE_ADAPTERS = { tee: TeeAdapter };

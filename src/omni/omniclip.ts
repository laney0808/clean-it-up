import { OmniContext, omnislate } from '@omnimedia/omniclip/x/context/context.js';
import { single_panel_layout } from '@benev/construct';
import { registerElements } from '@omnimedia/omniclip/x/tools/register-elements.js';
import { getComponents } from '@omnimedia/omniclip/x/get-components.js';
import { TimelinePanel } from '@omnimedia/omniclip/x/components/omni-timeline/panel.js';
import { MediaPlayerPanel } from '@omnimedia/omniclip/x/components/omni-timeline/views/media-player/panel.js';

let registered = false;
let activeProjectId: string | null = null;

export function ensureOmniRegistered() {
  if (registered) return;
  registerElements(getComponents());
  registered = true;
}

export function ensureOmniContext(projectId: string) {
  ensureOmniRegistered();

  if (activeProjectId === projectId && omnislate.context) {
    return omnislate.context as OmniContext;
  }

  activeProjectId = projectId;
  omnislate.context = new OmniContext({
    projectId,
    panels: {
      TimelinePanel,
      MediaPlayerPanel,
    },
    layouts: {
      empty: single_panel_layout('MediaPlayerPanel'),
      default: single_panel_layout('MediaPlayerPanel'),
    },
  });

  return omnislate.context as OmniContext;
}

export async function sha256Hex(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

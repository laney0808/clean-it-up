import { AppCore, type Nexus, type Pojo, ZipAction, watch, signals, register_to_dom } from "@benev/slate";
import { slate, Context, type PanelSpec, single_panel_layout, ConstructEditor } from "@benev/construct/x/mini.js";

import { store } from "@omnimedia/omniclip/x/context/controllers/store/store.js";
import { Media } from "@omnimedia/omniclip/x/context/controllers/media/controller.js";
import { Timeline } from "@omnimedia/omniclip/x/context/controllers/timeline/controller.js";
import { Shortcuts } from "@omnimedia/omniclip/x/context/controllers/shortcuts/controller.js";
import { Compositor } from "@omnimedia/omniclip/x/context/controllers/compositor/controller.js";
import { historical_state, non_historical_state } from "@omnimedia/omniclip/x/context/state.js";
import { VideoExport } from "@omnimedia/omniclip/x/context/controllers/video-export/controller.js";
import { historical_actions, non_historical_actions } from "@omnimedia/omniclip/x/context/actions.js";
import { Collaboration } from "@omnimedia/omniclip/x/context/controllers/collaboration/controller.js";
import { FFmpegHelper } from "@omnimedia/omniclip/x/context/controllers/video-export/helpers/FFmpegHelper/helper.js";

import { TimelinePanel } from "@omnimedia/omniclip/x/components/omni-timeline/panel.js";
import { MediaPanel } from "@omnimedia/omniclip/x/components/omni-media/panel.js";
import { MediaPlayerPanel } from "@omnimedia/omniclip/x/components/omni-timeline/views/media-player/panel.js";
import { TextPanel } from "@omnimedia/omniclip/x/components/omni-text/panel.js";
import { ExportPanel } from "@omnimedia/omniclip/x/components/omni-timeline/views/export/panel.js";
import { ProjectSettingsPanel } from "@omnimedia/omniclip/x/views/project-settings/panel.js";
import { AnimPanel } from "@omnimedia/omniclip/x/components/omni-anim/panel.js";
import { FiltersPanel } from "@omnimedia/omniclip/x/components/omni-filters/panel.js";
import { TransitionsPanel } from "@omnimedia/omniclip/x/components/omni-transitions/panel.js";

import type { StockLayouts } from "@benev/construct/x/context/controllers/layout/parts/utils/stock_layouts.js";
import type { HistoricalState, State } from "@omnimedia/omniclip/x/context/types.js";

export interface MiniContextOptions {
  projectId: string;
  panels: Pojo<PanelSpec>;
  layouts: StockLayouts;
}

export const collaboration = new Collaboration();
let queue = Promise.resolve();

function removeLoadingPageIndicator() {
  const el = document.querySelector(".loading-page-indicator");
  if (el && el.parentElement) el.parentElement.removeChild(el);
}

export class OmniContext extends Context {
  #non_historical_state = watch.stateTree(non_historical_state);
  #non_historical_actions = ZipAction.actualize(this.#non_historical_state, non_historical_actions);

  #store = store(localStorage);

  // state tree with history
  #core: AppCore<HistoricalState, any>;

  get state(): State {
    return { ...this.#non_historical_state.state, ...this.#core.state } as State;
  }

  get actions() {
    return {
      ...this.#non_historical_actions,
      ...this.#core?.actions,
    } as any;
  }

  clear_project(omit?: boolean) {
    this.actions.clear_project({ omit });
    this.actions.remove_all_effects({ omit });
    this.actions.remove_tracks({ omit });
    this.controllers.compositor.clear(omit);
  }

  helpers = {
    ffmpeg: new FFmpegHelper(this.actions),
  };

  is_webcodecs_supported = signals.op();
  controllers!: {
    compositor: Compositor;
    media: Media;
    timeline: Timeline;
    video_export: VideoExport;
    shortcuts: Shortcuts;
    collaboration: Collaboration;
  };

  #check_if_webcodecs_supported() {
    if (!(window as any).VideoEncoder && !(window as any).VideoDecoder) {
      this.is_webcodecs_supported.setError("webcodecs-not-supported");
    } else {
      this.is_webcodecs_supported.setReady(true);
    }
  }

  #save_to_storage(state: HistoricalState) {
    if (collaboration.client || collaboration.isJoining) return;
    if (state.projectId) {
      this.#store[state.projectId] = {
        projectName: state.projectName,
        projectId: state.projectId,
        effects: state.effects,
        tracks: state.tracks,
        filters: state.filters,
        animations: state.animations,
        transitions: state.transitions,
      } as any;
    }
  }

  #state_from_storage(projectId: string) {
    return this.#store[projectId] as any;
  }

  #updateAnimationTimeline(state: HistoricalState) {
    const timelineDuration = Math.max(
      ...state.effects.map((effect: any) => effect.start_at_position + (effect.end - effect.start)),
    );
    this.controllers.compositor.managers.animationManager.updateTimelineDuration(timelineDuration);
    this.controllers.compositor.managers.transitionManager.updateTimelineDuration(timelineDuration);
  }

  #listen_for_state_changes() {
    watch.track(() => this.#core.state, (state) => {
      this.#save_to_storage(state);
      this.#updateAnimationTimeline(state);
    });
    watch.track(() => this.#core.state.effects, async () => {
      queue = queue.then(async () => {
        await this.controllers.compositor.managers.animationManager.refresh(this.state);
      });
    });
    watch.track(() => this.#core.state.animations, async () => {
      queue = queue.then(async () => {
        await this.controllers.compositor.managers.animationManager.refresh(this.state);
      });
    });
  }

  // after loading state from localstorage, compositor objects must be recreated
  #recreate_project_from_localstorage_state(state: State, media: Media) {
    this.controllers.compositor.recreate(state as any, media);
  }

  constructor(options: MiniContextOptions) {
    super(options);
    this.drops.editor.dragover = () => {};
    this.#core = new AppCore({
      initial_state: this.#state_from_storage(options.projectId) ?? { ...historical_state, projectId: options.projectId },
      history_limit: 64,
      actions_blueprint: ZipAction.blueprint<HistoricalState>()(historical_actions as any),
    });

    this.#check_if_webcodecs_supported();
    const compositor = new Compositor(this.actions);
    const media = new Media();
    this.controllers = {
      compositor,
      media,
      timeline: new Timeline(this.actions, media, compositor),
      video_export: new VideoExport(this.actions, compositor, media),
      shortcuts: new Shortcuts(this as any, this.actions),
      collaboration,
    };

    this.#listen_for_state_changes();
    this.#recreate_project_from_localstorage_state(this.state, this.controllers.media);
    removeLoadingPageIndicator();
  }

  undo() {
    (this.#core as any).history.undo();
    this.controllers.compositor.update_canvas_objects(this.state as any);
  }

  redo() {
    (this.#core as any).history.redo();
    this.controllers.compositor.update_canvas_objects(this.state as any);
  }

  get history() {
    return (this.#core as any).history.annals;
  }
}

export const omnislate = slate as unknown as Nexus<OmniContext>;
export const { shadow_component, shadow_view, light_view, light_component } = omnislate as any;

export function setupContext(projectId: string) {
  omnislate.context = new OmniContext({
    projectId,
    panels: {
      TimelinePanel,
      MediaPanel,
      MediaPlayerPanel,
      TextPanel,
      ExportPanel,
      ProjectSettingsPanel,
      AnimPanel,
      FiltersPanel,
      TransitionsPanel,
    },
    layouts: {
      empty: single_panel_layout("TimelinePanel"),
      default: single_panel_layout("TimelinePanel"),
    },
  } as any);

  return omnislate;
}

export function registerConstructEditorElement() {
  register_to_dom({ ConstructEditor });
}

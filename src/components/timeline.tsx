import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn, formatTimestampMS } from '../utils';
import type { OmniContext } from '../omniclip';

export type OmniClipScrubberProps = {
  context: OmniContext,
  durationMS: number,
  timecode: number, //context.state.timecode
  timebase: number, //context.state.timebase,
  playheadDrag
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function OmniClipScrubber({
  context,
  durationMS,
  timecode,
  timebase,
  playheadDrag
}: OmniClipScrubberProps) {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubberValue, setScrubberValue] = useState(0);
  const valueRef = useRef(scrubberValue);
  valueRef.current = scrubberValue;
  const durationMax = Math.max(durationMS, 0);
  const inputMax = Math.max(durationMax, 0.01);
  const [disabled, setDisabled] = useState(false);
  
  const translate_to_timecode = useCallback((milliseconds: number) => {
    context.actions.set_timecode(milliseconds);
  }, [context]);

  useEffect(() => {
    try {
      const dispose = playheadDrag.onPlayheadMove(({x}) => translate_to_timecode(x));
      console.log('configured')
      return () => {
        if (typeof dispose === 'function') dispose();
      }
    } catch (e) {
      console.error(e);
    }
  }, [playheadDrag, translate_to_timecode])
  
  useEffect(() => {
    console.log('sync scrub')
    if (isScrubbing) return;
    setScrubberValue(timecode);
  }, [timecode, isScrubbing]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setIsScrubbing(false);
    playheadDrag.drop()
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (!isScrubbing) return;
    console.log('blur triggered');
  };

  const handleInput = (_event: React.FormEvent<HTMLInputElement>) => {
    setIsScrubbing(true);
    context.actions.set_is_playing(false)
		playheadDrag.start()
  }

  return (
    <div className={cn('shrink-0 border-t border-white/10 bg-[#141821] px-4 py-3')}>
      <div className="flex items-center justify-between text-xs text-zinc-400 mb-2 font-mono">
        <span>{formatTimestampMS(isScrubbing ? scrubberValue : timecode)}</span>
        <span>{formatTimestampMS(durationMax)}</span>
      </div>
      <div className="py-2">
        <input
          type="range"
          min={0}
          max={inputMax}
          step={1000/timebase}
          value={Math.min(scrubberValue, inputMax)}
          onInput={handleInput}
          onChange={handleChange}
          onBlur={handleBlur}
          className={cn('w-full omni-scrubber')}
        />
      </div>
    </div>
  );
}

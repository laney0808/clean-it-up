import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getGDriveStreamUrl(link: string) {
  const regex = /(?:id=|\/d\/|file\/d\/)([\w-]+)/;
  const match = link.match(regex);
  if (match && match[1]) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  return link;
}

export function proxyUrl(url: string | undefined) {
  if (url?.includes('drive.google.com')) {
    return `/api/proxy-video?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export function formatTimestampSeconds(seconds: number, fps: number = 30) {
  if (isNaN(seconds) || !isFinite(seconds)) return "00:00:00";
  
  const totalSeconds = Math.max(0, seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * fps);
  
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export function formatTimestampMS(miliseconds: number) {
  if (!Number.isFinite(miliseconds)) return "00:00:000";

  const totalMs = miliseconds <= 0 ? 0 : Math.trunc(miliseconds);
  const mins = (totalMs / 60000) | 0;
  const secs = ((totalMs - mins * 60000) / 1000) | 0;
  const mili = ((totalMs - mins * 60000 - secs * 1000)) | 0;

  const mm = mins < 10 ? `0${mins}` : `${mins}`;
  const ss = secs < 10 ? `0${secs}` : `${secs}`;
  const ms = mili < 10 ? `00${mili}` : mili < 100 ? `0${mili}` : `${mili}`;

  return `${mm}:${ss}:${ms}`;
}

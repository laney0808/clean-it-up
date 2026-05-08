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

export function formatTimestamp(seconds: number, fps: number = 30) {
  if (isNaN(seconds) || !isFinite(seconds)) return "00:00:00";
  
  const totalSeconds = Math.max(0, seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * fps);
  
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export function splitFileName(filename: string): { name: string; extension: string } {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex <= 0) return { name: filename, extension: '' };
  return {
    name: filename.substring(0, lastDotIndex),
    extension: filename.substring(lastDotIndex)
  };
}

export function getFileNameWithoutExtension(filename: string): string {
  return splitFileName(filename).name;
}

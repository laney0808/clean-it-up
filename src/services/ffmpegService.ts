import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export const getFFmpeg = async () => {
  if (ffmpeg) return ffmpeg;

  console.log('--- FFmpeg Initialization Started ---');
  console.log('SharedArrayBuffer available:', typeof SharedArrayBuffer !== 'undefined');
  
  ffmpeg = new FFmpeg();
  
  ffmpeg.on('log', ({ message }) => {
    console.log('FFmpeg Internal Log:', message);
  });

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  
  try {
    console.log('Loading FFmpeg core from unpkg...');
    // Add a timeout to the load process
    const loadPromise = (async () => {
      await ffmpeg!.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
    })();

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('FFmpeg load timeout (30s)')), 30000)
    );

    await Promise.race([loadPromise, timeoutPromise]);
    console.log('FFmpeg core loaded successfully.');
  } catch (err) {
    console.error('CRITICAL: Failed to load FFmpeg core:', err);
    throw new Error(`Failed to load video conversion engine: ${err instanceof Error ? err.message : 'Unknown error'}. Your browser might not support SharedArrayBuffer or the CDN might be blocked.`);
  }

  return ffmpeg;
};

export const convertToMp4 = async (
  file: File | ArrayBuffer, 
  fileName: string,
  onProgress?: (progress: number) => void
): Promise<{ data: ArrayBuffer; name: string; type: string }> => {
  console.log('--- Starting Conversion Process ---');
  console.log('Original File Name:', fileName);
  
  const instance = await getFFmpeg();
  
  // Use fixed names to avoid issues with special characters or spaces
  const inputName = 'input_file';
  const outputName = 'output_file.mp4';

  const progressHandler = ({ progress }: { progress: number }) => {
    const percent = Math.round(progress * 100);
    console.log(`Conversion Progress: ${percent}%`);
    if (onProgress) onProgress(percent);
  };

  instance.on('progress', progressHandler);

  try {
    const blob = file instanceof ArrayBuffer ? new Blob([file]) : file;
    console.log('Input File Size:', (blob.size / (1024 * 1024)).toFixed(2), 'MB');
    
    const fileData = await fetchFile(blob);
    await instance.writeFile(inputName, fileData);
    
    console.log('Executing FFmpeg command...');
    // -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" ensures even dimensions for libx264
    // -pix_fmt yuv420p is for maximum compatibility
    // -y overwrites any existing file
    const result = await instance.exec([
      '-i', inputName, 
      '-c:v', 'libx264', 
      '-preset', 'ultrafast', 
      '-crf', '28', 
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
      '-movflags', '+faststart',
      '-c:a', 'aac', 
      '-b:a', '128k', 
      '-y',
      outputName
    ]);

    if (result !== 0) {
      console.error('FFmpeg execution failed with code:', result);
      // Try a more basic command if the first one fails (e.g. maybe audio codec is the issue)
      console.log('Attempting fallback conversion (no audio)...');
      const fallbackResult = await instance.exec([
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
        '-an', // Disable audio
        '-y',
        outputName
      ]);
      
      if (fallbackResult !== 0) {
        throw new Error(`FFmpeg failed with exit code ${result} and fallback failed with ${fallbackResult}`);
      }
      console.log('Fallback conversion successful.');
    }

    console.log('Reading output file from virtual FS...');
    const data = await instance.readFile(outputName);
    console.log('Output File Size:', (data.length / (1024 * 1024)).toFixed(2), 'MB');
    
    // Cleanup
    await instance.deleteFile(inputName);
    await instance.deleteFile(outputName);

    return {
      data: (data as Uint8Array).buffer,
      name: fileName.replace(/\.[^/.]+$/, "") + ".mp4",
      type: 'video/mp4'
    };
  } catch (error) {
    console.error('CRITICAL: FFmpeg service error:', error);
    throw error;
  } finally {
    instance.off('progress', progressHandler);
  }
};

import { Project, VideoAsset, Note, db } from './db';

/**
 * Parses a standalone HTML file and imports the project data.
 */
export const importFromHtml = async (htmlContent: string): Promise<Project> => {
  // Try to find project ID using markers
  const idMatch = htmlContent.match(/\/\* PROJECT_ID_START \*\/ (.*?) \/\* PROJECT_ID_END \*\//);
  const projectId = idMatch ? idMatch[1].trim() : crypto.randomUUID();

  // Check for collision
  const existing = await db.getProject(projectId);
  if (existing) {
    throw new Error('PROJECT_COLLISION');
  }

  const now = Date.now();

  // Extract project name from <title>
  const titleMatch = htmlContent.match(/<title>(.*?) - VideoNote Viewer/);
  const projectName = titleMatch ? titleMatch[1] : 'Imported Project';

  // Extract notes JSON using markers
  const notesMatch = htmlContent.match(/\/\* NOTES_START \*\/ (\[.*?\]) \/\* NOTES_END \*\//s);
  const notesData: any[] = notesMatch ? JSON.parse(notesMatch[1]) : [];

  // Extract offset using markers
  const offsetMatch = htmlContent.match(/\/\* OFFSET_START \*\/ (.*?) \/\* OFFSET_END \*\//);
  const offset = offsetMatch ? parseFloat(offsetMatch[1]) : 0;

  // Extract names using markers
  const refNameMatch = htmlContent.match(/\/\* REF_NAME_START \*\/ (.*?) \/\* REF_NAME_END \*\//);
  const refName = refNameMatch ? JSON.parse(refNameMatch[1]) : 'Reference Video';
  const compNameMatch = htmlContent.match(/\/\* COMP_NAME_START \*\/ (.*?) \/\* COMP_NAME_END \*\//);
  const compName = compNameMatch && compNameMatch[1].trim() !== 'null' ? JSON.parse(compNameMatch[1]) : 'Comparison Video';

  // Extract reference data URL using markers
  const refMatch = htmlContent.match(/\/\* REF_DATA_START \*\/ `(.*?)` \/\* REF_DATA_END \*\//s);
  const refDataUrl = refMatch ? refMatch[1] : null;

  // Extract comparison data URL using markers
  const compMatch = htmlContent.match(/\/\* COMP_DATA_START \*\/ (.*?) \/\* COMP_DATA_END \*\//s);
  let compDataUrl = null;
  if (compMatch) {
    const val = compMatch[1].trim();
    if (val.startsWith('`')) {
      compDataUrl = val.slice(1, -1);
    } else if (val !== 'null') {
      compDataUrl = val.replace(/^['"]|['"]$/g, '');
    }
  }

  // Fallback to old regex if markers not found (for backward compatibility)
  if (!refDataUrl) {
    const oldRefMatch = htmlContent.match(/const refDataUrl = `(.*?)`;/s);
    if (oldRefMatch) {
      const refUrl = oldRefMatch[1];
      const oldNotesMatch = htmlContent.match(/const notes = (\[.*?\]);/s);
      const oldNotesData = oldNotesMatch ? JSON.parse(oldNotesMatch[1]) : [];
      const oldOffsetMatch = htmlContent.match(/const offset = (.*?);/);
      const oldOffset = oldOffsetMatch ? parseFloat(oldOffsetMatch[1]) : 0;
      return importWithDataUrls(projectId, projectName, oldNotesData, oldOffset, refUrl, compDataUrl || extractOldComp(htmlContent), 'Reference Video', 'Comparison Video');
    }
    throw new Error('Could not find reference video in the HTML file.');
  }

  return importWithDataUrls(projectId, projectName, notesData, offset, refDataUrl, compDataUrl, refName, compName);
};

const extractOldComp = (htmlContent: string): string | null => {
  const oldCompMatch = htmlContent.match(/const compDataUrl = (.*?);/s);
  if (oldCompMatch) {
    const val = oldCompMatch[1].trim();
    if (val.startsWith('`')) return val.slice(1, -1);
    if (val !== 'null') return val.replace(/^['"]|['"]$/g, '');
  }
  return null;
};

const importWithDataUrls = async (
  projectId: string,
  projectName: string,
  notesData: any[],
  offset: number,
  refDataUrl: string,
  compDataUrl: string | null,
  refName: string,
  compName: string
): Promise<Project> => {
  const now = Date.now();
  const newProject: Project = {
    id: projectId,
    name: projectName,
    createdAt: now,
  };

  await db.saveProject(newProject);

  // Helper to convert data URL to ArrayBuffer
  const dataUrlToBuffer = async (dataUrl: string): Promise<{ buffer: ArrayBuffer, type: string }> => {
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      throw new Error('Invalid or missing video data in HTML file.');
    }

    try {
      // Try fetch first as it's most memory efficient for large blobs
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error(`Fetch failed with status: ${response.status}`);
      const blob = await response.blob();
      return {
        buffer: await blob.arrayBuffer(),
        type: blob.type
      };
    } catch (err) {
      console.warn('Fetch failed for data URL, attempting manual conversion:', err);
      
      try {
        // Fallback to manual base64 decoding if fetch fails (common in some iframe/security contexts)
        const parts = dataUrl.split(',');
        if (parts.length < 2) throw new Error('Malformed data URL');
        
        const header = parts[0];
        const base64 = parts[1].replace(/\s/g, ''); // Remove any whitespace
        
        const mimeMatch = header.match(/:(.*?);/);
        const type = mimeMatch ? mimeMatch[1] : 'video/mp4';
        
        // Use a more robust way to decode base64 that handles larger strings better than atob alone
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        return {
          buffer: bytes.buffer,
          type: type
        };
      } catch (fallbackErr) {
        console.error('Manual conversion also failed:', fallbackErr);
        throw new Error(`Failed to load video data: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  };

  // Import reference video
  const refInfo = await dataUrlToBuffer(refDataUrl);
  const refVideo: VideoAsset = {
    id: crypto.randomUUID(),
    projectId,
    name: refName,
    data: refInfo.buffer,
    size: refInfo.buffer.byteLength,
    type: refInfo.type,
    offset: 0,
    isReference: true,
    createdAt: now,
  };
  await db.saveVideo(refVideo);

  // Import comparison video if exists
  if (compDataUrl && compDataUrl !== 'null') {
    const compInfo = await dataUrlToBuffer(compDataUrl);
    const compVideo: VideoAsset = {
      id: crypto.randomUUID(),
      projectId,
      name: compName,
      data: compInfo.buffer,
      size: compInfo.buffer.byteLength,
      type: compInfo.type,
      offset: offset,
      isReference: false,
      createdAt: now,
    };
    await db.saveVideo(compVideo);
  }

  // Import notes
  for (const note of notesData) {
    const newNote: Note = {
      id: crypto.randomUUID(),
      projectId,
      timestamp: note.timestamp,
      text: note.text,
      createdAt: now,
    };
    await db.saveNote(newNote);
  }

  return newProject;
};

/**
 * Parses a project JSON file and imports metadata.
 */
export const importFromJson = async (jsonContent: string): Promise<{ project: Project, missingVideos: { id: string, name: string, isReference: boolean, offset: number }[] }> => {
  const data = JSON.parse(jsonContent);
  const projectId = data.project?.id || crypto.randomUUID();

  // Check for collision
  const existing = await db.getProject(projectId);
  if (existing) {
    throw new Error('PROJECT_COLLISION');
  }

  const now = Date.now();

  const newProject: Project = {
    id: projectId,
    name: data.project.name || 'Imported Project',
    createdAt: now,
  };

  await db.saveProject(newProject);

  // Import notes
  if (data.notes && Array.isArray(data.notes)) {
    for (const note of data.notes) {
      const newNote: Note = {
        id: crypto.randomUUID(),
        projectId,
        timestamp: note.timestamp,
        text: note.text,
        createdAt: now,
      };
      await db.saveNote(newNote);
    }
  }

  // Identify missing videos
  const missingVideos = (data.videos || []).map((v: any) => ({
    id: v.id || crypto.randomUUID(),
    name: v.name,
    isReference: v.isReference,
    offset: v.offset || 0
  }));

  return { project: newProject, missingVideos };
};

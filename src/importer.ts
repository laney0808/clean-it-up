import { db, Note, Project, ProjectVideo } from './db';
import { putOmniVideoFile } from './omniDb';

export const importFromHtml = async (htmlContent: string): Promise<Project> => {
  const projectId = crypto.randomUUID();
  const omniProjectId = crypto.randomUUID();
  const now = Date.now();

  const titleMatch = htmlContent.match(/<title>(.*?) - VideoNote Viewer<\/title>/);
  const projectTitle = titleMatch ? titleMatch[1] : 'Imported Project';

  const notesMatch = htmlContent.match(/\/\* NOTES_START \*\/ (\[.*?\]) \/\* NOTES_END \*\//s);
  const notesData: Array<{ timestamp: number; text: string }> = notesMatch
    ? JSON.parse(notesMatch[1])
    : [];

  const startAtMatch =
    htmlContent.match(/\/\* START_AT_START \*\/ (.*?) \/\* START_AT_END \*\//) ??
    htmlContent.match(/\/\* OFFSET_START \*\/ (.*?) \/\* OFFSET_END \*\//);
  const comparisonStartAt = startAtMatch ? parseFloat(startAtMatch[1]) : 0;

  const refNameMatch = htmlContent.match(/\/\* REF_NAME_START \*\/ (.*?) \/\* REF_NAME_END \*\//);
  const referenceName = refNameMatch ? JSON.parse(refNameMatch[1]) : 'Reference Video';
  const compNameMatch = htmlContent.match(/\/\* COMP_NAME_START \*\/ (.*?) \/\* COMP_NAME_END \*\//);
  const comparisonName =
    compNameMatch && compNameMatch[1].trim() !== 'null'
      ? JSON.parse(compNameMatch[1])
      : 'Comparison Video';

  const refMatch = htmlContent.match(/\/\* REF_DATA_START \*\/ `(.*?)` \/\* REF_DATA_END \*\//s);
  const refDataUrl = refMatch ? refMatch[1] : null;

  const compMatch = htmlContent.match(/\/\* COMP_DATA_START \*\/ (.*?) \/\* COMP_DATA_END \*\//s);
  let comparisonDataUrl: string | null = null;
  if (compMatch) {
    const value = compMatch[1].trim();
    if (value.startsWith('`')) comparisonDataUrl = value.slice(1, -1);
    else if (value !== 'null') comparisonDataUrl = value.replace(/^['"]|['"]$/g, '');
  }

  if (!refDataUrl) {
    throw new Error('Could not find reference video in the HTML file.');
  }

  const project: Project = {
    id: projectId,
    title: projectTitle,
    omniProjectId,
    videoIds: [],
    createdAt: now,
  };

  await db.saveProject(project);

  const dataUrlToFile = async (dataUrl: string, fallbackName: string): Promise<File> => {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const extension = blob.type === 'video/quicktime' ? 'mov' : 'mp4';
    return new File([blob], fallbackName || `imported-video.${extension}`, {
      type: blob.type || 'video/mp4',
      lastModified: now,
    });
  };

  const referenceFile = await dataUrlToFile(refDataUrl, referenceName);
  const referenceVideoId = crypto.randomUUID();
  const referenceOmniKey = `${omniProjectId}:${referenceVideoId}`;

  await putOmniVideoFile(referenceOmniKey, referenceFile);

  const referenceVideo: ProjectVideo = {
    id: referenceVideoId,
    projectId,
    displayName: referenceName,
    omniFileKey: referenceOmniKey,
    role: 'reference',
    startAt: 0,
    createdAt: now,
  };

  await db.saveProjectVideo(referenceVideo);

  if (comparisonDataUrl) {
    const comparisonFile = await dataUrlToFile(comparisonDataUrl, comparisonName);
    const comparisonVideoId = crypto.randomUUID();
    const comparisonOmniKey = `${omniProjectId}:${comparisonVideoId}`;

    await putOmniVideoFile(comparisonOmniKey, comparisonFile);

    const comparisonVideo: ProjectVideo = {
      id: comparisonVideoId,
      projectId,
      displayName: comparisonName,
      omniFileKey: comparisonOmniKey,
      role: 'comparison',
      startAt: Number.isFinite(comparisonStartAt) ? comparisonStartAt : 0,
      createdAt: now,
    };

    await db.saveProjectVideo(comparisonVideo);
  }

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

  const savedProject = await db.getProject(projectId);
  if (!savedProject) {
    throw new Error('Project import finished, but the imported project could not be reloaded.');
  }

  return savedProject;
};

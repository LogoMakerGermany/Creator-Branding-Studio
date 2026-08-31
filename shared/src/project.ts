export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  type: ProjectType;
  ownerId: string;
  agencyId?: string;
  clientId?: string;
  teamId?: string;
  dnaId?: string;
  assignedTo: string[];
  deadline?: string;
  assets: ProjectAsset[];
  feedback: ProjectFeedback[];
  /** Soft-delete timestamp — present when in trash */
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus =
  | 'draft'
  | 'in_progress'
  | 'review'
  | 'revision'
  | 'completed'
  | 'archived';

export type ProjectType =
  | 'logo'
  | 'branding'
  | 'banner'
  | 'video'
  | 'intro'
  | 'overlay'
  | 'full_package'
  | 'custom'
  | 'streamset'
  | 'mockup'
  | 'shorts'
  | 'social'
  | 'text';

export type ProjectAssetSourceType =
  | 'generation'
  | 'file'
  | 'content'
  | 'video'
  | 'mockup'
  | 'animation'
  | 'text';

export interface ProjectAsset {
  id: string;
  name: string;
  type: string;
  url: string;
  version: number;
  createdAt: string;
  jobId?: string;
  fileId?: string;
  module?: string;
  sourceType?: ProjectAssetSourceType;
  sourceId?: string;
  mimeType?: string;
  size?: number;
  assetKey?: string;
  parentAssetId?: string;
}

export interface ProjectExportAssetMeta {
  id: string;
  name: string;
  type: string;
  module?: string;
  version: number;
  mimeType?: string;
  source?: string;
  filename: string;
  missing: boolean;
  jobId?: string;
  fileId?: string;
}

export interface ProjectExportManifest {
  exportVersion: 1;
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  exportedAt: string;
  dna: { id: string; name: string; version?: number } | null;
  assets: ProjectExportAssetMeta[];
  /** Present for import compatibility with older ZIP archives. */
  project?: Partial<Project>;
}

export interface ProjectFeedback {
  id: string;
  userId: string;
  message: string;
  assetId?: string;
  createdAt: string;
}

export interface DesignVersion {
  id: string;
  projectId: string;
  assetId: string;
  version: number;
  url: string;
  changeRequest?: string;
  parentVersionId?: string;
  createdAt: string;
}

export interface ChangeRequest {
  id: string;
  projectId: string;
  assetId: string;
  userId: string;
  request: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  resultUrl?: string;
  versionBefore?: string;
  versionAfter?: string;
  createdAt: string;
  completedAt?: string;
}

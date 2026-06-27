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
  | 'custom';

export interface ProjectAsset {
  id: string;
  name: string;
  type: string;
  url: string;
  version: number;
  createdAt: string;
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

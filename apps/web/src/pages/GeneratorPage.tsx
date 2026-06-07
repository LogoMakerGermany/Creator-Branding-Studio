import { useParams } from 'react-router-dom';
import type { AssetType } from '@cbs/shared';
import { ASSET_TYPES } from '@cbs/shared';
import { GeneratorShell } from '../components/GeneratorShell';

export function GeneratorPage() {
  const { id, type } = useParams<{ id: string; type: string }>();
  const assetType = (ASSET_TYPES.includes(type as AssetType) ? type : 'logo') as AssetType;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold capitalize text-gradient">{type?.replace(/_/g, ' ')}</h1>
      <div className="mt-6">
        <GeneratorShell projectId={id!} assetType={assetType} />
      </div>
    </div>
  );
}

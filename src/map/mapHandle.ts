// The live map instance, for overlays that need to place things on it.
import type { Map as MLMap } from 'maplibre-gl';

export const mapHandle: { current: MLMap | null } = { current: null };

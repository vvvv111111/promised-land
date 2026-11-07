import type { RoomDefinition } from "../room/types";

export type ObjectType = "pet" | "furniture" | "memory";
export interface Anchor { x: number; y: number }
export interface AssetDefinition {
  asset_id: string;
  path: string;
  type: "background" | ObjectType;
  width: number;
  height: number;
  has_alpha: boolean;
  alpha_bounds: number[] | null;
  default_anchor: Anchor;
  default_size: { width: number };
}
export interface AssetManifest { version: number; assets: AssetDefinition[] }
export interface Interaction { title: string; description: string }
export interface PlacementSurface {
  surface_id: string;
  kind: "floor" | "tabletop";
  /** Four corners: back, right, front, left; normalized to background. */
  polygon: Anchor[];
  depth_y?: number;
  blockers: { id: string; polygon: Anchor[] }[];
}
export interface PlacementRules {
  version: number;
  projection: "orthographic";
  surfaces: PlacementSurface[];
  occluders: { id: string; depth_y: number; polygons: Anchor[][] }[];
}
export interface WorldObject {
  object_id: string;
  asset_id: string;
  type: ObjectType;
  position_x: number;
  position_y: number;
  size: { width: number };
  anchor?: Anchor;
  visible: boolean;
  clickable: boolean;
  draggable?: boolean;
  content_type?: "photo_frame" | "letter";
  placement?: {
    contact: Anchor;
    /** Ground-plane axis lengths, measured relative to background width. */
    footprint: { width: number; depth: number };
    surfaces: string[];
  };
  interaction: Interaction;
}
export interface WorldHotspot {
  hotspot_id: string;
  furniture_name: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  interaction: Interaction;
}
export interface WorldConfig {
  version: number;
  world_id: string;
  background_id: string;
  objects: WorldObject[];
  hotspots: WorldHotspot[];
  placement?: PlacementRules;
}
export interface RoomTarget {
  id: string;
  kind: "object" | "hotspot";
  interaction: Interaction;
}
export interface RoomSnapshot {
  selected: RoomTarget | null;
  message: string;
  storage_warning: string;
}
export interface RoomRendererOptions {
  world: WorldConfig;
  manifest: AssetManifest;
  onInteract: (target: RoomTarget) => void;
  onReady: () => void;
  onError: (message: string) => void;
}

export type GiftMode = "sender" | "recipient";
export interface PhotoFrameContent {
  kind: "photo_frame";
  photo: string | null;
  zoom: number;
  position_x: number;
  position_y: number;
}
export interface LetterContent { kind: "letter"; body: string }
export type GiftContent = PhotoFrameContent | LetterContent;
export interface GiftDetails {
  recipient: string;
  sender: string;
  memory: string;
  /** The first photo lives only in the photo-frame content. */
  extra_photos: string[];
}
export interface GiftConfig {
  version: 1;
  revision?: number;
  gift_id: string;
  world_id: string;
  object_contents: Record<string, GiftContent>;
  details?: GiftDetails;
  room?: RoomDefinition;
}

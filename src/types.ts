export type ShapeKind = 'rect' | 'ellipse' | 'triangle';
export type ObjKind = 'room' | 'item';
export type Tool = 'select' | ShapeKind;
export type Mode = 'setup' | 'track';

export interface CleanObj {
  id: string;
  kind: ObjKind;
  shape: ShapeKind;
  /** Bounding box in world (floor plan pixel) coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Triangle orientation, 0–3 quarter turns clockwise. */
  orient: number;
  /** Triangle variant: right-angled (true) or isosceles (false). */
  right: boolean;
  name: string;
  /** Days between cleans. */
  intervalDays: number;
  /** Epoch ms of the last clean, or null if never cleaned. */
  lastCleaned: number | null;
  history: number[];
  /** For items: the room the item sits in (derived from geometry). */
  roomId: string | null;
  /** Sync timestamps: last layout/name/schedule edit, and last cleaning-record edit. */
  editedAt: number;
  cleanEditedAt: number;
}

export interface FloorImage {
  id: string;
  src: string;
  width: number;
  height: number;
}

export interface ExportData {
  app: 'cleanup';
  version: 1;
  objects: CleanObj[];
  image: FloorImage | null;
  imageOpacity: number;
}

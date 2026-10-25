/** Parser for the packed terrain field payload (`OTF1`).

The server ships one gzipped container per world; the browser receives it
already decompressed by the HTTP layer, so this module only walks the header
and slices the blocks.  Keeping the layout here (not duplicated in the
component) makes the wire contract testable on its own.
 */

export interface TerrainFieldBlock {
  name: string;
  dtype: "u16" | "u8";
  n: number;
  offset: number;
  byteLength: number;
  min: number;
  scale: number;
}

export interface TerrainRiverStem {
  acc: number;
  pts: Array<[number, number]>;
}

export interface TerrainFieldsHeader {
  version: number;
  seed: number;
  style: string;
  width: number;
  height: number;
  gw: number;
  gh: number;
  sea: number;
  relief: number;
  river_cut: number;
  rivers: TerrainRiverStem[];
  tributary_count: number;
  detail_off_x: number;
  detail_off_y: number;
  detail_w: number;
  detail_h: number;
  forest: [number, number, number];
  river: [number, number, number];
  paper: [number, number, number];
  panel: [number, number, number];
  ink: [number, number, number];
  blocks: TerrainFieldBlock[];
}

export interface TerrainFields {
  header: TerrainFieldsHeader;
  buffer: ArrayBuffer;
  body: number;
  block(name: string): TerrainFieldBlock;
  bytes(name: string): Uint8Array;
  u16(name: string): Uint16Array;
}

const MAGIC = "OTF1";
/** Must match FIELDS_VERSION in apps/maps/terrain_fields.py. */
const FORMAT_VERSION = 3;

export function parseTerrainFields(buffer: ArrayBuffer): TerrainFields {
  if (buffer.byteLength < 12) throw new Error("地形字段载荷过短");
  const view = new DataView(buffer);
  const magic =
    String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== MAGIC) throw new Error("未知的地形字段格式");
  const headerLength = view.getUint32(4, true);
  const body = 8 + headerLength;
  if (body > buffer.byteLength) throw new Error("地形字段头被截断");
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 8, headerLength)),
  ) as TerrainFieldsHeader;
  if (header.version !== FORMAT_VERSION) {
    throw new Error(`地形字段版本不匹配（${header.version} != ${FORMAT_VERSION}）`);
  }
  const byName = new Map(header.blocks.map((block) => [block.name, block]));

  const block = (name: string): TerrainFieldBlock => {
    const found = byName.get(name);
    if (!found) throw new Error(`地形字段缺少 ${name}`);
    return found;
  };
  const bytes = (name: string): Uint8Array => {
    const item = block(name);
    return new Uint8Array(buffer, body + item.offset, item.byteLength);
  };
  const u16 = (name: string): Uint16Array => {
    const item = block(name);
    const start = body + item.offset;
    if (start % 2 === 0) return new Uint16Array(buffer, start, item.n);
    // Byte-misaligned blocks are copied once; the payload is immutable.
    const copy = new Uint16Array(item.n);
    new Uint8Array(copy.buffer).set(bytes(name));
    return copy;
  };

  return { header, buffer, body, block, bytes, u16 };
}

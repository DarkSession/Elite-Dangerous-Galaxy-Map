// The types of what the KTX2 writer exports. The script itself is JavaScript, because
// node runs it directly with no build step.

export declare const NEBULA_KTX2_HEADER_BYTES: number;
export declare const VK_FORMAT_BC1_RGB_UNORM_BLOCK: number;
export declare const VK_FORMAT_BC4_UNORM_BLOCK: number;
export declare const NEBULA_KTX2_WRITER: string;
export declare const KTX2_IDENTIFIER: Uint8Array;

export declare function writeNebulaKtx2(volume: {
  readonly format: number;
  readonly side: number;
  readonly blocks: Uint8Array;
}): Uint8Array;

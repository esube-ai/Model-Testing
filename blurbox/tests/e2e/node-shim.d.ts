// Minimal typings for the few Node globals the e2e tests touch, so @types/node isn't required.
interface NodeBufferLike extends Uint8Array {
  toString(encoding?: 'base64' | 'latin1'): string;
}
declare const Buffer: {
  from(data: string, encoding: 'base64'): NodeBufferLike;
  from(data: Uint8Array | number[]): NodeBufferLike;
  concat(list: Uint8Array[]): NodeBufferLike;
};

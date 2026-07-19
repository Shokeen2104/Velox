/**
 * Reads a file, splits it into chunks, and calculates SHA-256 for each chunk.
 * 
 * WHY WE CHUNK AND HASH:
 * - Chunking allows a file to be requested in pieces (BitTorrent style).
 * - Hashing each chunk individually ensures data integrity. When a leecher receives 
 *   a chunk from any peer (who we might not trust), they can hash the received bytes
 *   and compare it to the original seeder's manifest. If it matches, the chunk is good.
 * - This makes resumable downloads and swarm downloads (from multiple peers) possible.
 */
export async function processFileChunks(file, chunkSize, onProgress) {
  const totalSize = file.size;
  const totalChunks = Math.ceil(totalSize / chunkSize);
  const chunks = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, totalSize);
    const chunkBlob = file.slice(start, end);
    
    // Read blob as ArrayBuffer for hashing
    const buffer = await chunkBlob.arrayBuffer();
    
    // Calculate SHA-256 using Web Crypto API
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    chunks.push({
      index: i,
      hash: hashHex,
      size: chunkBlob.size
    });

    if (onProgress) {
      onProgress(((i + 1) / totalChunks) * 100);
    }
  }

  return {
    fileName: file.name,
    totalSize,
    chunkSize,
    totalChunks,
    chunks
  };
}

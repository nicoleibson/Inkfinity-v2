export function saveProof(proof: any): void {
  // Placeholder for handling World ID proof.
  // In production you might store the proof in a DB or send it to your backend.
  try {
    console.log('World ID proof saved:', proof);
  } catch (e) {
    console.error('Error saving proof:', e);
  }
}

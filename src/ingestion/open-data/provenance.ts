/** Verification time belongs on observedAt, not in immutable source content.
 * Otherwise a successful unchanged/304 refresh looks like a source contradiction.
 */
export function stableSourceProof<T extends { receivedAt: string }>(proof: T): Omit<T, 'receivedAt'> {
  const { receivedAt, ...content } = proof;
  void receivedAt;
  return content;
}

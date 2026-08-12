import log from "@/utils/log";

export function parseIceCandidateType(candidate: string | null | undefined) {
  if (!candidate) {
    return null;
  }

  const matched = /\btyp\s+([a-z]+)/i.exec(candidate);
  return matched?.[1] ?? null;
}

export async function logSelectedIceCandidatePair(
  connection: RTCPeerConnection,
  callId: string
) {
  try {
    const stats = await connection.getStats();
    let selectedPair: RTCIceCandidatePairStats | null = null;

    for (const report of stats.values()) {
      if (report.type === "transport") {
        const transportReport = report as RTCTransportStats;
        if (transportReport.selectedCandidatePairId) {
          const candidatePairReport = stats.get(
            transportReport.selectedCandidatePairId
          );
          if (candidatePairReport?.type === "candidate-pair") {
            selectedPair = candidatePairReport as RTCIceCandidatePairStats;
          }
        }
      }
    }

    if (!selectedPair) {
      for (const report of stats.values()) {
        if (report.type === "candidate-pair") {
          const candidatePair = report as RTCIceCandidatePairStats;
          const isSelected =
            "selected" in candidatePair
              ? Boolean(candidatePair.selected)
              : false;
          const isNominated =
            "nominated" in candidatePair
              ? Boolean(candidatePair.nominated)
              : false;
          if (isSelected || isNominated) {
            selectedPair = candidatePair;
          }
        }
      }
    }

    if (!selectedPair) {
      log.warn("Call ICE candidate pair unavailable", { callId });
      return;
    }

    const candidatePair = selectedPair;
    const localCandidate = candidatePair.localCandidateId
      ? stats.get(candidatePair.localCandidateId)
      : null;
    const remoteCandidate = candidatePair.remoteCandidateId
      ? stats.get(candidatePair.remoteCandidateId)
      : null;

    log.info("Call ICE candidate pair selected", {
      callId,
      localCandidateType:
        localCandidate && "candidateType" in localCandidate
          ? localCandidate.candidateType
          : null,
      remoteCandidateType:
        remoteCandidate && "candidateType" in remoteCandidate
          ? remoteCandidate.candidateType
          : null,
      localProtocol:
        localCandidate && "protocol" in localCandidate
          ? localCandidate.protocol
          : null,
      remoteProtocol:
        remoteCandidate && "protocol" in remoteCandidate
          ? remoteCandidate.protocol
          : null,
      networkType:
        localCandidate && "networkType" in localCandidate
          ? localCandidate.networkType
          : null
    });
  } catch (error) {
    log.warn("Failed to inspect call ICE candidate pair", {
      callId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function logIceFailureSnapshot(
  connection: RTCPeerConnection,
  callId: string
) {
  try {
    const stats = await connection.getStats();
    const localCandidateTypes = new Set<string>();
    const remoteCandidateTypes = new Set<string>();
    const candidatePairStates = new Set<string>();
    let successfulPairs = 0;
    let totalPairs = 0;

    for (const report of stats.values()) {
      if (report.type === "local-candidate") {
        if ("candidateType" in report && report.candidateType) {
          localCandidateTypes.add(report.candidateType);
        }
      }
      if (report.type === "remote-candidate") {
        if ("candidateType" in report && report.candidateType) {
          remoteCandidateTypes.add(report.candidateType);
        }
      }
      if (report.type === "candidate-pair") {
        const pair = report as RTCIceCandidatePairStats;
        totalPairs += 1;
        if (pair.state) {
          candidatePairStates.add(pair.state);
        }
        if (pair.state === "succeeded") {
          successfulPairs += 1;
        }
      }
    }

    log.warn("Call ICE failure snapshot", {
      callId,
      localCandidateTypes: Array.from(localCandidateTypes),
      remoteCandidateTypes: Array.from(remoteCandidateTypes),
      candidatePairStates: Array.from(candidatePairStates),
      successfulPairs,
      totalPairs
    });
  } catch (error) {
    log.warn("Failed to inspect call ICE failure snapshot", {
      callId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

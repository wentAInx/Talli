import type { DatabaseExecutor } from "../db/connection";
import {
  findAccountWithAsset,
  findExternalCandidate,
  findExternalConnection,
  findExternalSourceObjectById,
  findFileImportCandidateDetail,
  findFileImportProfile,
  findFileImportSourceDetail,
  listExternalCandidateLegs,
  listExternalCandidateSourceLinks,
} from "../db/queries";
import {
  assertFileImportCandidateProvenance,
  type ValidatedFileImportCandidateProvenance,
} from "../domain/file-import-provenance";
import { ServiceError } from "./errors";

export function assertStoredFileImportCandidateProvenance(
  executor: DatabaseExecutor,
  candidateId: string,
): ValidatedFileImportCandidateProvenance {
  const candidate = findExternalCandidate(executor, candidateId) ?? null;
  const connection = candidate
    ? (findExternalConnection(executor, candidate.connectionId) ?? null)
    : null;
  const profile = candidate
    ? (findFileImportProfile(executor, candidate.connectionId) ?? null)
    : null;
  const candidateDetail = candidate
    ? (findFileImportCandidateDetail(executor, candidate.id) ?? null)
    : null;
  const target = candidateDetail
    ? (findAccountWithAsset(executor, candidateDetail.targetAccountId) ?? null)
    : null;
  const sourceLinks = candidate
    ? listExternalCandidateSourceLinks(executor, candidate.id)
    : [];
  const sources = sourceLinks.flatMap((link) => {
    const source = findExternalSourceObjectById(executor, link.sourceObjectId);
    return source ? [source] : [];
  });
  const sourceDetails = sources.flatMap((source) => {
    const detail = findFileImportSourceDetail(executor, source.id);
    return detail ? [detail] : [];
  });
  const legs = candidate
    ? listExternalCandidateLegs(executor, candidate.id)
    : [];
  try {
    return assertFileImportCandidateProvenance({
      connection,
      profile,
      targetAccount: target?.account ?? null,
      targetAsset: target?.asset ?? null,
      candidate,
      candidateDetail,
      sourceLinks,
      sources,
      sourceDetails,
      legs,
    });
  } catch {
    throw new ServiceError(
      "FILE_IMPORT_PROVENANCE_INTEGRITY_ERROR",
      "File-import candidate financial provenance is inconsistent.",
    );
  }
}

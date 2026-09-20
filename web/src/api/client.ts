export type SourceKind = "youtube_video" | "youtube_playlist";

export interface SourceReceipt {
  sourceId: string;
  jobId: string;
  kind: SourceKind;
}

export interface SummarizerApi {
  createSource(url: string): Promise<SourceReceipt>;
}

export class ApiUnavailableError extends Error {
  constructor() {
    super("Le control plane n’est pas encore connecté.");
    this.name = "ApiUnavailableError";
  }
}

export const unavailableApi: SummarizerApi = {
  createSource: async () => {
    throw new ApiUnavailableError();
  },
};

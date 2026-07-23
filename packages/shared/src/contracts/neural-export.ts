import { z } from 'zod';
import { type Quality, qualitySchema } from './enums';
import { premiumTierSchema } from './me';

/**
 * Contratti per il Neural Export (download upscalato XQ/XQ+ con Anime4K/libplacebo).
 * Vedi INTEGRATION_NEURAL_EXPORT.md. La ricetta arriva da `GET /neural-export/profile` (auth Bearer);
 * gli shader sono pubblici (MIT) su `/static/anime4k/<file>`. L'elaborazione e' client-side
 * (worker GPU), zero carico sui server AnimeUnion.
 */

// Id profilo lato server: `xq` = 1080p, `xqplus` = 4K. Distinto dall'enum `Quality` locale
// (SD/XQ/XQPLUS) che marca la riga episode_file: la mappa sotto fa da ponte.
export const neuralProfileIdSchema = z.enum(['xq', 'xqplus']);
export type NeuralProfileId = z.infer<typeof neuralProfileIdSchema>;

/** Ponte Quality (episode_file) -> profileId (ricetta). SD non ha profilo neurale. */
export function profileIdForQuality(quality: Quality): NeuralProfileId | null {
  if (quality === 'XQ') {
    return 'xq';
  }
  if (quality === 'XQPLUS') {
    return 'xqplus';
  }
  return null;
}

/** Ponte inverso profileId -> Quality. */
export function qualityForProfileId(id: NeuralProfileId): Quality {
  return id === 'xqplus' ? 'XQPLUS' : 'XQ';
}

// Un file shader Anime4K servito da AnimeUnion. `sha256` va verificato dopo il download.
export const neuralExportShaderSchema = z
  .object({
    file: z.string(),
    url: z.string(),
    sha256: z.string(),
    sizeBytes: z.number().int().nonnegative().optional(),
  })
  .passthrough();
export type NeuralExportShader = z.infer<typeof neuralExportShaderSchema>;

// Un profilo "ricetta": catena di shader (ordinata) + parametri di encode. `audio` sempre "copy".
export const neuralExportProfileSchema = z
  .object({
    id: neuralProfileIdSchema,
    chain: z.array(z.string()),
    targetWidth: z.number().int().positive(),
    targetHeight: z.number().int().positive(),
    videoBitrate: z.string(),
    videoCodec: z.string(),
    audio: z.literal('copy').default('copy'),
    faststart: z.boolean().default(true),
  })
  .passthrough();
export type NeuralExportProfile = z.infer<typeof neuralExportProfileSchema>;

// Ricetta completa. Tollerante ai campi extra/nuovi (passthrough) per non rompere il parse a un bump
// non-breaking lato server. `requiredTiers` e' informativo: il gate autorevole resta `features.neuralExport`.
export const neuralExportRecipeSchema = z
  .object({
    version: z.number().int(),
    requiredTiers: z.array(premiumTierSchema).default([]),
    profiles: z.array(neuralExportProfileSchema),
    shaders: z.array(neuralExportShaderSchema),
    license: z.string().nullable().default(null),
    reference: z.string().nullable().default(null),
  })
  .passthrough();
export type NeuralExportRecipe = z.infer<typeof neuralExportRecipeSchema>;

// --- Contratto worker <-> NAS (HTTP) ---

// Payload JSON inviato al worker insieme all'MP4 (multipart). Contiene solo cio' che serve al render:
// il worker non ha bisogno del token integration (gli shader sono pubblici).
export const neuralExportJobPayloadSchema = z.object({
  profile: neuralExportProfileSchema,
  shaders: z.array(neuralExportShaderSchema),
});
export type NeuralExportJobPayload = z.infer<typeof neuralExportJobPayloadSchema>;

export const neuralWorkerJobStateSchema = z.enum(['queued', 'running', 'done', 'error']);
export type NeuralWorkerJobState = z.infer<typeof neuralWorkerJobStateSchema>;

// Stato di un job dal worker.
export const neuralWorkerJobStatusSchema = z.object({
  id: z.string(),
  state: neuralWorkerJobStateSchema,
  progress: z.number().min(0).max(1).default(0),
  error: z.string().nullable().default(null),
});
export type NeuralWorkerJobStatus = z.infer<typeof neuralWorkerJobStatusSchema>;

// Risultato del feature-detect del worker (probe ffmpeg/Vulkan). Serve al gate UI.
export const neuralWorkerCapabilitiesSchema = z.object({
  ffmpegCapable: z.boolean(),
  hasLibplacebo: z.boolean(),
  hasVulkan: z.boolean(),
  fps: z.number().nullable().default(null),
});
export type NeuralWorkerCapabilities = z.infer<typeof neuralWorkerCapabilitiesSchema>;

export const neuralWorkerHealthSchema = neuralWorkerCapabilitiesSchema.extend({
  ok: z.boolean(),
});
export type NeuralWorkerHealth = z.infer<typeof neuralWorkerHealthSchema>;

// --- Discovery + enrollment worker (collegamento automatico app desktop ↔ NAS) ---

// Carta d'identità del worker, esposta su GET /identity SENZA autenticazione (nessun segreto):
// permette a NAS/browser di riconoscere un worker AnimeUnion durante lo scan della LAN.
export const neuralWorkerIdentitySchema = z.object({
  app: z.literal('animeunion-worker'),
  name: z.string(),
  version: z.string(),
  capabilities: neuralWorkerCapabilitiesSchema,
});
export type NeuralWorkerIdentity = z.infer<typeof neuralWorkerIdentitySchema>;

// Richiesta di enrollment dall'app desktop al NAS: URL LAN del worker + token generato dall'app +
// nome del PC. Niente codice: è il worker (avviato dall'utente sul suo PC) a collegarsi al NAS.
export const neuralWorkerEnrollRequestSchema = z.object({
  workerUrl: z.string().url(),
  token: z.string().min(1),
  name: z.string().default(''),
});
export type NeuralWorkerEnrollRequest = z.infer<typeof neuralWorkerEnrollRequestSchema>;

// Esito dell'enrollment: config salvata + salute del worker verificata al volo dal NAS.
export const neuralWorkerEnrollResultSchema = z.object({
  enrolled: z.boolean(),
  reachable: z.boolean(),
  ffmpegCapable: z.boolean(),
  fps: z.number().nullable().default(null),
});
export type NeuralWorkerEnrollResult = z.infer<typeof neuralWorkerEnrollResultSchema>;

// --- DTO per la UI (tRPC) ---

// Sintesi profilo per la UI (senza dettagli di encode).
export const neuralExportProfileSummarySchema = z.object({
  id: neuralProfileIdSchema,
  quality: qualitySchema,
  targetWidth: z.number().int().positive(),
  targetHeight: z.number().int().positive(),
});
export type NeuralExportProfileSummary = z.infer<typeof neuralExportProfileSummarySchema>;

// Stato salute del worker per la UI (nessun segreto).
export const neuralWorkerStatusSchema = z.object({
  configured: z.boolean(),
  enabled: z.boolean(),
  reachable: z.boolean(),
  ffmpegCapable: z.boolean(),
  fps: z.number().nullable().default(null),
  // Nome e URL del worker collegato (non segreti): mostrati in Impostazioni. Vuoti = nessuno.
  name: z.string().default(''),
  url: z.string().default(''),
});
export type NeuralWorkerStatus = z.infer<typeof neuralWorkerStatusSchema>;

// Stato complessivo mostrato in Impostazioni/Premium.
export const neuralExportStatusSchema = z.object({
  // Vero se tutte le condizioni per offrire l'export sono soddisfatte (entitlement + config + worker).
  available: z.boolean(),
  // L'utente ha il flag features.neuralExport dal server.
  entitled: z.boolean(),
  recipeVersion: z.number().int().nullable().default(null),
  profiles: z.array(neuralExportProfileSummarySchema).default([]),
  worker: neuralWorkerStatusSchema,
});
export type NeuralExportStatus = z.infer<typeof neuralExportStatusSchema>;

// Stato di un export lato NAS (tabella neural_export_job) per la UI coda.
export const neuralExportJobViewStateSchema = z.enum([
  'queued',
  'running',
  'done',
  'error',
  'cancelled',
]);
export type NeuralExportJobViewState = z.infer<typeof neuralExportJobViewStateSchema>;

export const neuralExportJobViewSchema = z.object({
  id: z.string(),
  episodeFileId: z.string(),
  animeTitle: z.string().nullable().default(null),
  episodeNumber: z.number().int().nullable().default(null),
  quality: qualitySchema,
  state: neuralExportJobViewStateSchema,
  progress: z.number().min(0).max(1).default(0),
  error: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NeuralExportJobView = z.infer<typeof neuralExportJobViewSchema>;

// Input tRPC per avviare un export.
export const neuralExportRequestSchema = z.object({
  episodeFileId: z.string().min(1),
  // Solo qualita' neurali: SD non e' un export.
  quality: z.enum(['XQ', 'XQPLUS']),
});
export type NeuralExportRequest = z.infer<typeof neuralExportRequestSchema>;

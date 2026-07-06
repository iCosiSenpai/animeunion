import {
  fileDeleteInputSchema,
  fileLinkExternalInputSchema,
  fileLinkExternalResultSchema,
  fileListInputSchema,
  fileListSchema,
  fileMkdirInputSchema,
  fileMoveInputSchema,
  fileOpResultSchema,
  filePruneEmptyInputSchema,
  fileRelinkInputSchema,
  fileRenameInputSchema,
  fileRenameToSchemeInputSchema,
  trashListSchema,
  trashRestoreInputSchema,
} from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

// Output/inputs dello scanner duplicati: contratto self-contained (non in shared), il client tRPC
// ne inferisce comunque i tipi dal router.
const dedupeMoveInputSchema = z.object({ paths: z.array(z.string()).max(5000) });

/** Gestore file incorporato: naviga e modifica i file scaricati dentro le cartelle configurate. */
export const filesRouter = router({
  list: publicProcedure
    .input(fileListInputSchema)
    .output(fileListSchema)
    .query(({ ctx, input }) => ctx.services.files.list(input.path)),

  rename: publicProcedure
    .input(fileRenameInputSchema)
    .output(fileOpResultSchema)
    .mutation(({ ctx, input }) => ctx.services.files.rename(input.path, input.newName)),

  move: publicProcedure
    .input(fileMoveInputSchema)
    .output(fileOpResultSchema)
    .mutation(({ ctx, input }) => ctx.services.files.move(input.path, input.destDir)),

  remove: publicProcedure
    .input(fileDeleteInputSchema)
    .output(fileOpResultSchema)
    .mutation(({ ctx, input }) => ctx.services.files.remove(input.path)),

  findDuplicates: publicProcedure.query(({ ctx }) => ctx.services.files.findDuplicates()),

  dedupeMove: publicProcedure
    .input(dedupeMoveInputSchema)
    .mutation(({ ctx, input }) => ctx.services.files.dedupeMove(input.paths)),

  mkdir: publicProcedure
    .input(fileMkdirInputSchema)
    .output(fileOpResultSchema)
    .mutation(({ ctx, input }) => ctx.services.files.mkdir(input.parent, input.name)),

  relink: publicProcedure
    .input(fileRelinkInputSchema)
    .output(fileOpResultSchema)
    .mutation(({ ctx, input }) => ctx.services.files.relink(input.path, input.episodeFileId)),

  linkExternalFolder: publicProcedure
    .input(fileLinkExternalInputSchema)
    .output(fileLinkExternalResultSchema)
    .mutation(({ ctx, input }) =>
      ctx.services.files.linkExternalFolder(input.path, input.animeId, input.language),
    ),

  renameToScheme: publicProcedure
    .input(fileRenameToSchemeInputSchema)
    .output(fileOpResultSchema)
    .mutation(({ ctx, input }) => ctx.services.files.renameToScheme(input.path)),

  pruneEmpty: publicProcedure
    .input(filePruneEmptyInputSchema)
    .output(fileOpResultSchema)
    .mutation(({ ctx, input }) => ctx.services.files.pruneEmpty(input.path)),

  trashList: publicProcedure
    .output(trashListSchema)
    .query(({ ctx }) => ctx.services.files.trashList()),

  trashRestore: publicProcedure
    .input(trashRestoreInputSchema)
    .output(fileOpResultSchema)
    .mutation(({ ctx, input }) => ctx.services.files.trashRestore(input.id)),

  trashEmpty: publicProcedure
    .output(fileOpResultSchema)
    .mutation(({ ctx }) => ctx.services.files.trashEmpty()),
});

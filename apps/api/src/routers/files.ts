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
} from '@animeunion/shared';
import { publicProcedure, router } from '../trpc';

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
});

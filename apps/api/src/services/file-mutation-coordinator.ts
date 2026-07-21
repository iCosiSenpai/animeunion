export interface FileMutationCoordinator {
  runExclusive<T>(operation: () => Promise<T>): Promise<T>;
}

/**
 * Serializza le operazioni che devono mantenere coerenti filesystem e righe episode_file.
 * La coda assorbe i rejection solo per continuare a servire le operazioni successive; il
 * chiamante riceve comunque l'errore originale della propria operazione.
 */
export function createFileMutationCoordinator(): FileMutationCoordinator {
  let tail: Promise<void> = Promise.resolve();

  return {
    runExclusive<T>(operation: () => Promise<T>): Promise<T> {
      const result = tail.then(operation);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
